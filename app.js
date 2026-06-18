(function () {
  const SOURCE_MAX_FILE_SIZE = 20 * 1024 * 1024;
  const API_PAYLOAD_MAX_SIZE = 5 * 1024 * 1024;
  const API_MAX_DIMENSION = 2400;
  const API_MIN_DIMENSION = 1200;
  const API_JPEG_QUALITY = 0.88;
  const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg"]);
  const CONFIG = window.BACKGROUND_REMOVER_CONFIG || {};
  const RATE_LIMIT_COUNT = 3;
  const RATE_LIMIT_WINDOW_MS = 60 * 1000;

  const PRESETS = {
    ppt: {
      summary: "透過PNG・余白小",
      background: "transparent",
      margin: "small",
      format: "png",
      center: true,
      alphaCutoff: 24,
      edgeContrast: 20
    },
    work: {
      summary: "白背景・余白中",
      background: "white",
      margin: "medium",
      format: "png",
      center: true,
      alphaCutoff: 20,
      edgeContrast: 15
    },
    qc: {
      summary: "白背景・中央配置",
      background: "white",
      margin: "medium",
      format: "png",
      center: true,
      alphaCutoff: 24,
      edgeContrast: 20
    },
    parts: {
      summary: "部品写真・背景切替",
      background: "white",
      margin: "small",
      format: "png",
      center: true,
      alphaCutoff: 30,
      edgeContrast: 28
    },
    custom: {
      summary: "カスタム設定",
      background: "transparent",
      margin: "small",
      format: "png",
      center: true,
      alphaCutoff: 24,
      edgeContrast: 20
    }
  };

  const MARGIN_RATIO = {
    none: 0,
    small: 0.04,
    medium: 0.10,
    large: 0.18
  };

  const fileInput = document.getElementById("fileInput");
  const selectButton = document.getElementById("selectButton");
  const dropZone = document.getElementById("dropZone");
  const presetSummary = document.getElementById("presetSummary");
  const presetButtons = document.querySelectorAll("[data-preset]");
  const outputBackground = document.getElementById("outputBackground");
  const marginSize = document.getElementById("marginSize");
  const centerObject = document.getElementById("centerObject");
  const outputFormat = document.getElementById("outputFormat");
  const alphaCutoff = document.getElementById("alphaCutoff");
  const edgeContrast = document.getElementById("edgeContrast");
  const alphaCutoffValue = document.getElementById("alphaCutoffValue");
  const edgeContrastValue = document.getElementById("edgeContrastValue");
  const progressText = document.getElementById("progressText");
  const progressBar = document.getElementById("progressBar");
  const fileList = document.getElementById("fileList");
  const failureList = document.getElementById("failureList");
  const saveButton = document.getElementById("saveButton");
  const compareButton = document.getElementById("compareButton");
  const resultStage = document.getElementById("resultStage");
  const emptyState = document.getElementById("emptyState");
  const resultCanvas = document.getElementById("resultCanvas");
  const activeFileName = document.getElementById("activeFileName");
  const activeFileStatus = document.getElementById("activeFileStatus");
  const outputSummary = document.getElementById("outputSummary");
  const resultImage = document.getElementById("resultImage");
  const compareView = document.getElementById("compareView");
  const beforeImage = document.getElementById("beforeImage");
  const afterImage = document.getElementById("afterImage");
  const afterClip = document.getElementById("afterClip");
  const compareHandle = document.getElementById("compareHandle");
  const compareSlider = document.getElementById("compareSlider");
  const processingOverlay = document.getElementById("processingOverlay");
  const processingText = document.getElementById("processingText");
  const viewBgButtons = document.querySelectorAll("[data-view-bg]");

  const apiCanvas = document.createElement("canvas");
  const apiContext = apiCanvas.getContext("2d");
  const workCanvas = document.createElement("canvas");
  const workContext = workCanvas.getContext("2d", { willReadFrequently: true });
  const outputCanvas = document.createElement("canvas");
  const outputContext = outputCanvas.getContext("2d");

  let items = [];
  let activeId = null;
  let currentPreset = "ppt";
  let processing = false;
  let compareMode = false;
  let requestTimestamps = [];

  function endpoint() {
    return String(CONFIG.apiEndpoint || "").trim();
  }

  function settings() {
    return {
      background: outputBackground.value,
      margin: marginSize.value,
      format: outputFormat.value,
      center: centerObject.checked,
      alphaCutoff: Number(alphaCutoff.value),
      edgeContrast: Number(edgeContrast.value)
    };
  }

  function setPreset(name) {
    currentPreset = name;
    const preset = PRESETS[name];
    outputBackground.value = preset.background;
    marginSize.value = preset.margin;
    outputFormat.value = preset.format;
    centerObject.checked = preset.center;
    alphaCutoff.value = preset.alphaCutoff;
    edgeContrast.value = preset.edgeContrast;
    presetSummary.textContent = preset.summary;
    presetButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.preset === name);
    });
    updateLabels();
    refreshOutputSummary();
  }

  function markCustom() {
    if (currentPreset === "custom") return;
    currentPreset = "custom";
    presetSummary.textContent = PRESETS.custom.summary;
    presetButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.preset === "custom");
    });
  }

  function updateLabels() {
    alphaCutoffValue.textContent = alphaCutoff.value;
    edgeContrastValue.textContent = edgeContrast.value;
  }

  function refreshOutputSummary() {
    const s = settings();
    const bgLabel = { transparent: "透明", white: "白背景", black: "黒背景" }[s.background];
    const marginLabel = { none: "余白なし", small: "余白小", medium: "余白中", large: "余白大" }[s.margin];
    const formatLabel = s.format.toUpperCase();
    outputSummary.textContent = `${bgLabel}${formatLabel} / ${marginLabel} / ${s.center ? "中央配置" : "原寸寄せ"}`;
    saveButton.textContent = successfulItems().length > 1 ? "すべてZIPで保存" : `${formatLabel}保存`;
  }

  function setBusy(isBusy, text) {
    processing = isBusy;
    selectButton.disabled = isBusy;
    processingOverlay.hidden = !isBusy;
    if (text) processingText.textContent = text;
    updateSaveState();
  }

  function updateSaveState() {
    const successCount = successfulItems().length;
    saveButton.disabled = processing || successCount === 0;
    compareButton.disabled = !activeItem() || !activeItem().compareUrl;
  }

  function successfulItems() {
    return items.filter((item) => item.status === "done" && item.finalBlob);
  }

  function activeItem() {
    return items.find((item) => item.id === activeId) || null;
  }

  function validateFile(file) {
    if (!ACCEPTED_TYPES.has(file.type)) return "PNG / JPG / JPEG のみ対応しています。";
    if (file.size > SOURCE_MAX_FILE_SIZE) return "20MBを超えています。";
    return "";
  }

  function makeCleanName(fileName, format) {
    const baseName = fileName.replace(/\.[^.]+$/, "") || "image";
    return `${baseName}_clean.${format === "jpeg" ? "jpg" : "png"}`;
  }

  function revokeItemUrls(item) {
    if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
    if (item.finalUrl) URL.revokeObjectURL(item.finalUrl);
    if (item.compareUrl) URL.revokeObjectURL(item.compareUrl);
  }

  function createItems(files) {
    items.forEach(revokeItemUrls);
    items = Array.from(files).map((file, index) => {
      const error = validateFile(file);
      return {
        id: `${Date.now()}-${index}`,
        file,
        apiFile: null,
        originalUrl: URL.createObjectURL(file),
        removedBlob: null,
        finalBlob: null,
        finalUrl: "",
        compareBlob: null,
        compareUrl: "",
        outputName: "",
        status: error ? "failed" : "queued",
        error,
        progressLabel: error || "待機中",
        apiSizeLabel: ""
      };
    });
    activeId = items[0] ? items[0].id : null;
    compareMode = false;
    renderAll();
  }

  function renderAll() {
    renderFileList();
    renderFailures();
    renderProgress();
    renderActive();
    refreshOutputSummary();
    updateSaveState();
  }

  function renderFileList() {
    fileList.innerHTML = "";
    if (!items.length) {
      fileList.innerHTML = '<p class="empty-list">画像がまだ選択されていません。</p>';
      return;
    }

    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `file-item ${item.id === activeId ? "active" : ""}`;
      button.dataset.id = item.id;
      button.innerHTML = `
        <img src="${item.originalUrl}" alt="">
        <span>
          <strong>${escapeHtml(item.file.name)}</strong>
          <small>${statusLabel(item)}</small>
        </span>
      `;
      button.addEventListener("click", () => {
        activeId = item.id;
        compareMode = false;
        renderAll();
      });
      fileList.appendChild(button);
    });
  }

  function statusLabel(item) {
    if (item.status === "queued") return "待機中";
    if (item.status === "processing") return item.progressLabel || "処理中";
    if (item.status === "done") return item.apiSizeLabel ? `完了 / API送信 ${item.apiSizeLabel}` : "完了";
    return item.error || "失敗";
  }

  function renderFailures() {
    const failed = items.filter((item) => item.status === "failed");
    failureList.hidden = failed.length === 0;
    failureList.innerHTML = failed.length
      ? `<strong>失敗した画像</strong>${failed.map((item) => `<span>${escapeHtml(item.file.name)}: ${escapeHtml(item.error)}</span>`).join("")}`
      : "";
  }

  function renderProgress() {
    if (!items.length) {
      progressText.textContent = "未選択";
      progressBar.style.width = "0%";
      return;
    }
    const finished = items.filter((item) => item.status === "done" || item.status === "failed").length;
    const total = items.length;
    const active = items.find((item) => item.status === "processing");
    progressText.textContent = active ? `${finished + 1} / ${total} 処理中` : `${finished} / ${total} 完了`;
    progressBar.style.width = `${Math.round((finished / total) * 100)}%`;
  }

  function renderActive() {
    const item = activeItem();
    emptyState.hidden = Boolean(item);
    resultCanvas.hidden = !item;

    if (!item) return;

    activeFileName.textContent = item.file.name;
    activeFileStatus.textContent = statusLabel(item);
    beforeImage.src = item.originalUrl;

    resultImage.hidden = !item.finalUrl || compareMode;
    compareView.hidden = !item.compareUrl || !compareMode;

    if (item.finalUrl) {
      resultImage.src = item.finalUrl;
    } else {
      resultImage.removeAttribute("src");
    }

    if (item.compareUrl) {
      afterImage.src = item.compareUrl;
      compareButton.textContent = compareMode ? "結果だけ見る" : "比較を見る";
      updateCompareSlider();
    } else {
      afterImage.removeAttribute("src");
      compareButton.textContent = "比較を見る";
    }
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForRateSlot() {
    while (true) {
      const now = Date.now();
      requestTimestamps = requestTimestamps.filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
      if (requestTimestamps.length < RATE_LIMIT_COUNT) {
        requestTimestamps.push(now);
        return;
      }
      const waitMs = RATE_LIMIT_WINDOW_MS - (now - requestTimestamps[0]) + 300;
      processingText.textContent = `API制限に合わせて待機中 ${Math.ceil(waitMs / 1000)}秒`;
      await wait(Math.min(waitMs, 5000));
    }
  }

  async function processItems() {
    if (!endpoint()) {
      setGlobalError("API URL が未設定です。config.js を確認してください。");
      return;
    }

    setBusy(true, "処理中");
    const processable = items.filter((item) => item.status === "queued");

    for (let index = 0; index < processable.length; index += 1) {
      const item = processable[index];
      activeId = item.id;
      item.status = "processing";
      item.progressLabel = `${index + 1} / ${processable.length} 画像を軽量化中`;
      renderAll();

      try {
        item.apiFile = await prepareApiFile(item.file);
        item.apiSizeLabel = `${formatSize(item.file.size)} → ${formatSize(item.apiFile.size)}`;
        item.progressLabel = `${index + 1} / ${processable.length} 背景削除中`;
        renderAll();
        await waitForRateSlot();
        item.removedBlob = await callRemoveBackground(item.apiFile);
        item.progressLabel = "画像を整形中";
        renderAll();
        await renderFinalImage(item);
        item.status = "done";
        item.progressLabel = "完了";
      } catch (error) {
        item.status = "failed";
        item.error = error.message || String(error);
      }

      renderAll();
    }

    setBusy(false);
    renderAll();
  }

  async function prepareApiFile(file) {
    const bitmap = await createImageBitmap(file);
    let maxDimension = Math.min(API_MAX_DIMENSION, Math.max(bitmap.width, bitmap.height));
    let quality = API_JPEG_QUALITY;
    let blob = null;

    while (maxDimension >= API_MIN_DIMENSION) {
      blob = await encodeApiImage(bitmap, maxDimension, quality);
      if (blob.size <= API_PAYLOAD_MAX_SIZE) break;

      if (quality > 0.72) {
        quality -= 0.08;
      } else {
        maxDimension = Math.floor(maxDimension * 0.82);
        quality = API_JPEG_QUALITY;
      }
    }

    bitmap.close();

    if (!blob) throw new Error("画像の軽量化に失敗しました。");
    if (blob.size > API_PAYLOAD_MAX_SIZE) {
      throw new Error("軽量化後もAPI送信上限の5MBを超えています。");
    }
    if (blob.size >= file.size && file.size <= API_PAYLOAD_MAX_SIZE) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "_api.jpg"), { type: "image/jpeg" });
  }

  async function encodeApiImage(bitmap, maxDimension, quality) {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    apiCanvas.width = width;
    apiCanvas.height = height;
    apiContext.fillStyle = "#ffffff";
    apiContext.fillRect(0, 0, width, height);
    apiContext.drawImage(bitmap, 0, 0, width, height);
    return canvasToBlob(apiCanvas, "image/jpeg", quality);
  }

  async function callRemoveBackground(file) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(endpoint(), {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const blob = await response.blob();
    if (blob.type && blob.type !== "image/png") {
      throw new Error("APIからPNG以外のデータが返されました。");
    }
    return blob;
  }

  async function renderFinalImage(item) {
    if (!item.removedBlob) return;
    const s = settings();
    const final = await transformImage(item.removedBlob, s);
    const compare = await transformImage(item.removedBlob, {
      ...s,
      background: "transparent",
      format: "png"
    });

    if (item.finalUrl) URL.revokeObjectURL(item.finalUrl);
    if (item.compareUrl) URL.revokeObjectURL(item.compareUrl);
    item.finalBlob = final.blob;
    item.finalUrl = URL.createObjectURL(final.blob);
    item.compareBlob = compare.blob;
    item.compareUrl = URL.createObjectURL(compare.blob);
    item.outputName = makeCleanName(item.file.name, final.format);
  }

  async function transformImage(blob, s) {
    const bitmap = await createImageBitmap(blob);
    workCanvas.width = bitmap.width;
    workCanvas.height = bitmap.height;
    workContext.clearRect(0, 0, workCanvas.width, workCanvas.height);
    workContext.drawImage(bitmap, 0, 0);
    bitmap.close();

    const imageData = workContext.getImageData(0, 0, workCanvas.width, workCanvas.height);
    applyAlphaAdjustments(imageData, s);
    workContext.putImageData(imageData, 0, 0);

    const bounds = findAlphaBounds(imageData) || {
      x: 0,
      y: 0,
      width: workCanvas.width,
      height: workCanvas.height
    };

    const longest = Math.max(bounds.width, bounds.height);
    const padding = Math.round(longest * MARGIN_RATIO[s.margin]);
    const contentWidth = bounds.width + padding * 2;
    const contentHeight = bounds.height + padding * 2;
    const outputWidth = s.center ? Math.max(contentWidth, contentHeight) : contentWidth;
    const outputHeight = s.center ? Math.max(contentWidth, contentHeight) : contentHeight;
    const drawX = Math.round((outputWidth - bounds.width) / 2);
    const drawY = Math.round((outputHeight - bounds.height) / 2);

    outputCanvas.width = Math.max(1, outputWidth);
    outputCanvas.height = Math.max(1, outputHeight);
    outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

    const bg = s.format === "jpeg" && s.background === "transparent" ? "white" : s.background;
    if (bg !== "transparent") {
      outputContext.fillStyle = bg === "black" ? "#111827" : "#ffffff";
      outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    }

    outputContext.drawImage(
      workCanvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      drawX,
      drawY,
      bounds.width,
      bounds.height
    );

    const type = s.format === "jpeg" ? "image/jpeg" : "image/png";
    const finalBlob = await canvasToBlob(outputCanvas, type, 0.92);
    return { blob: finalBlob, format: s.format };
  }

  function applyAlphaAdjustments(imageData, s) {
    const data = imageData.data;
    const contrast = s.edgeContrast / 100;
    for (let index = 3; index < data.length; index += 4) {
      let alpha = data[index];
      if (alpha <= s.alphaCutoff) {
        alpha = 0;
      } else if (contrast > 0) {
        const normalized = alpha / 255;
        const sharpened = (normalized - 0.5) * (1 + contrast * 1.8) + 0.5;
        alpha = Math.max(0, Math.min(255, Math.round(sharpened * 255)));
      }
      data[index] = alpha;
    }
  }

  function findAlphaBounds(imageData) {
    const { width, height, data } = imageData;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 8) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < minX || maxY < minY) return null;
    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("画像の変換に失敗しました。"));
      }, type, quality);
    });
  }

  async function rerenderSuccessItems() {
    const doneItems = successfulItems();
    if (!doneItems.length) {
      refreshOutputSummary();
      return;
    }

    setBusy(true, "設定を反映中");
    for (const item of doneItems) {
      await renderFinalImage(item);
    }
    setBusy(false);
    renderAll();
  }

  function updateCompareSlider() {
    const value = Number(compareSlider.value);
    afterClip.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
    compareHandle.style.left = `${value}%`;
  }

  function setGlobalError(text) {
    progressText.textContent = text;
    failureList.hidden = false;
    failureList.innerHTML = `<strong>確認が必要です</strong><span>${escapeHtml(text)}</span>`;
  }

  async function saveOutput() {
    const successes = successfulItems();
    if (!successes.length) return;

    if (successes.length === 1) {
      downloadBlob(successes[0].finalBlob, successes[0].outputName);
      return;
    }

    if (!window.JSZip) {
      setGlobalError("ZIP保存ライブラリを読み込めませんでした。ネットワークを確認してください。");
      return;
    }

    const zip = new window.JSZip();
    successes.forEach((item) => {
      zip.file(item.outputName, item.finalBlob);
    });
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(zipBlob, "cleaned_images.zip");
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleFiles(files) {
    if (!files.length) return;
    createItems(files);
    processItems();
  }

  selectButton.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("click", (event) => {
    if (event.target !== selectButton) fileInput.click();
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragging");
  });
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
    handleFiles(event.dataTransfer.files);
  });
  fileInput.addEventListener("change", () => {
    handleFiles(fileInput.files);
    fileInput.value = "";
  });

  presetButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      setPreset(button.dataset.preset);
      await rerenderSuccessItems();
    });
  });

  [outputBackground, marginSize, outputFormat, alphaCutoff, edgeContrast].forEach((control) => {
    control.addEventListener("input", async () => {
      markCustom();
      updateLabels();
      refreshOutputSummary();
      await rerenderSuccessItems();
    });
  });

  centerObject.addEventListener("change", async () => {
    markCustom();
    refreshOutputSummary();
    await rerenderSuccessItems();
  });

  saveButton.addEventListener("click", saveOutput);
  compareButton.addEventListener("click", () => {
    compareMode = !compareMode;
    compareSlider.value = compareMode ? "50" : "100";
    renderActive();
  });
  compareSlider.addEventListener("input", updateCompareSlider);

  viewBgButtons.forEach((button) => {
    button.addEventListener("click", () => {
      viewBgButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      resultStage.className = `result-stage ${button.dataset.viewBg}`;
    });
  });

  setPreset("ppt");
  renderAll();
})();
