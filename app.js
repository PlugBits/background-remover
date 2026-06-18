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
  const HISTORY_LIMIT = 10;

  const PRESETS = {
    ppt: { summary: "透過PNG・余白小", background: "transparent", margin: "small", format: "png", center: true, alphaCutoff: 24, edgeContrast: 20 },
    work: { summary: "白背景・余白中", background: "white", margin: "medium", format: "png", center: true, alphaCutoff: 20, edgeContrast: 15 },
    qc: { summary: "白背景・中央配置", background: "white", margin: "medium", format: "png", center: true, alphaCutoff: 24, edgeContrast: 20 },
    parts: { summary: "部品写真・背景切替", background: "white", margin: "small", format: "png", center: true, alphaCutoff: 30, edgeContrast: 28 },
    custom: { summary: "カスタム設定", background: "transparent", margin: "small", format: "png", center: true, alphaCutoff: 24, edgeContrast: 20 }
  };

  const MARGIN_RATIO = { none: 0, small: 0.04, medium: 0.10, large: 0.18 };

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
  const editMode = document.getElementById("editMode");
  const showCandidates = document.getElementById("showCandidates");
  const brushSize = document.getElementById("brushSize");
  const featherSize = document.getElementById("featherSize");
  const brushSizeValue = document.getElementById("brushSizeValue");
  const featherSizeValue = document.getElementById("featherSizeValue");
  const undoButton = document.getElementById("undoButton");
  const redoButton = document.getElementById("redoButton");
  const resetMaskButton = document.getElementById("resetMaskButton");
  const progressText = document.getElementById("progressText");
  const progressBar = document.getElementById("progressBar");
  const fileList = document.getElementById("fileList");
  const failureList = document.getElementById("failureList");
  const saveButton = document.getElementById("saveButton");
  const compareButton = document.getElementById("compareButton");
  const resultStage = document.getElementById("resultStage");
  const emptyState = document.getElementById("emptyState");
  const resultCanvasShell = document.getElementById("resultCanvas");
  const activeFileName = document.getElementById("activeFileName");
  const activeFileStatus = document.getElementById("activeFileStatus");
  const outputSummary = document.getElementById("outputSummary");
  const resultCanvas = document.getElementById("resultImage");
  const resultContext = resultCanvas.getContext("2d");
  const candidateCanvas = document.getElementById("candidateCanvas");
  const candidateContext = candidateCanvas.getContext("2d");
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
  let drawing = false;
  let renderQueued = false;

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

  function brushSettings() {
    return {
      size: Number(brushSize.value),
      feather: Number(featherSize.value)
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
    presetButtons.forEach((button) => button.classList.toggle("active", button.dataset.preset === name));
    updateLabels();
    refreshOutputSummary();
  }

  function markCustom() {
    if (currentPreset === "custom") return;
    currentPreset = "custom";
    presetSummary.textContent = PRESETS.custom.summary;
    presetButtons.forEach((button) => button.classList.toggle("active", button.dataset.preset === "custom"));
  }

  function updateLabels() {
    alphaCutoffValue.textContent = alphaCutoff.value;
    edgeContrastValue.textContent = edgeContrast.value;
    brushSizeValue.textContent = brushSize.value;
    featherSizeValue.textContent = featherSize.value;
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
    const item = activeItem();
    const successCount = successfulItems().length;
    saveButton.disabled = processing || successCount === 0;
    compareButton.disabled = !item || !item.compareUrl;
    undoButton.disabled = !item || item.history.length === 0;
    redoButton.disabled = !item || item.redo.length === 0;
    resetMaskButton.disabled = !item || !item.maskAlpha;
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
        originalImageData: null,
        rawMaskAlpha: null,
        baseMaskAlpha: null,
        maskAlpha: null,
        candidateAlpha: null,
        finalBlob: null,
        finalUrl: "",
        compareBlob: null,
        compareUrl: "",
        outputName: "",
        renderMap: null,
        history: [],
        redo: [],
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

  async function renderActive() {
    const item = activeItem();
    emptyState.hidden = Boolean(item);
    resultCanvasShell.hidden = !item;

    if (!item) return;

    activeFileName.textContent = item.file.name;
    activeFileStatus.textContent = statusLabel(item);
    beforeImage.src = item.originalUrl;

    resultCanvas.hidden = !item.finalBlob || compareMode;
    candidateCanvas.hidden = resultCanvas.hidden || !shouldShowCandidates();
    compareView.hidden = !item.compareUrl || !compareMode;

    if (item.finalBlob && !compareMode) {
      await drawBlobToCanvas(item.finalBlob, resultCanvas, resultContext);
      renderCandidateOverlay(item);
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

  function shouldShowCandidates() {
    return showCandidates.checked || editMode.value === "candidate" || editMode.value === "clickRestore";
  }

  async function drawBlobToCanvas(blob, canvas, context) {
    const bitmap = await createImageBitmap(blob);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
  }

  function renderCandidateOverlay(item) {
    candidateCanvas.width = resultCanvas.width;
    candidateCanvas.height = resultCanvas.height;
    candidateContext.clearRect(0, 0, candidateCanvas.width, candidateCanvas.height);

    if (!item || !item.candidateAlpha || !item.renderMap || candidateCanvas.hidden) return;

    const { width, height } = candidateCanvas;
    const overlay = candidateContext.createImageData(width, height);
    const map = item.renderMap;
    const sourceWidth = item.originalImageData.width;

    for (let y = 0; y < map.drawHeight; y += 1) {
      const sourceY = map.sourceY + y;
      const outY = map.drawY + y;
      if (outY < 0 || outY >= height) continue;

      for (let x = 0; x < map.drawWidth; x += 1) {
        const sourceX = map.sourceX + x;
        const outX = map.drawX + x;
        if (outX < 0 || outX >= width) continue;
        if (!item.candidateAlpha[sourceY * sourceWidth + sourceX]) continue;

        const outIndex = (outY * width + outX) * 4;
        overlay.data[outIndex] = 0;
        overlay.data[outIndex + 1] = 132;
        overlay.data[outIndex + 2] = 255;
        overlay.data[outIndex + 3] = 92;
      }
    }

    candidateContext.putImageData(overlay, 0, 0);
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
        item.progressLabel = "マスクを作成中";
        renderAll();
        await initializeMask(item);
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

      if (quality > 0.72) quality -= 0.08;
      else {
        maxDimension = Math.floor(maxDimension * 0.82);
        quality = API_JPEG_QUALITY;
      }
    }

    bitmap.close();

    if (!blob) throw new Error("画像の軽量化に失敗しました。");
    if (blob.size > API_PAYLOAD_MAX_SIZE) throw new Error("軽量化後もAPI送信上限の5MBを超えています。");
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
    const response = await fetch(endpoint(), { method: "POST", body: formData });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const blob = await response.blob();
    if (blob.type && blob.type !== "image/png") throw new Error("APIからPNG以外のデータが返されました。");
    return blob;
  }

  async function initializeMask(item) {
    const removedBitmap = await createImageBitmap(item.removedBlob);
    const originalBitmap = await createImageBitmap(item.apiFile);
    const width = removedBitmap.width;
    const height = removedBitmap.height;

    workCanvas.width = width;
    workCanvas.height = height;
    workContext.clearRect(0, 0, width, height);
    workContext.drawImage(originalBitmap, 0, 0, width, height);
    item.originalImageData = workContext.getImageData(0, 0, width, height);

    workContext.clearRect(0, 0, width, height);
    workContext.drawImage(removedBitmap, 0, 0);
    const removedData = workContext.getImageData(0, 0, width, height);
    item.rawMaskAlpha = new Uint8ClampedArray(width * height);
    for (let index = 0, pixel = 0; index < removedData.data.length; index += 4, pixel += 1) {
      item.rawMaskAlpha[pixel] = removedData.data[index + 3];
    }

    item.baseMaskAlpha = adjustedMask(item.rawMaskAlpha, settings());
    item.maskAlpha = new Uint8ClampedArray(item.baseMaskAlpha);
    item.candidateAlpha = buildCandidateMap(item);
    item.history = [];
    item.redo = [];
    removedBitmap.close();
    originalBitmap.close();
  }

  function adjustedMask(rawMask, s) {
    const adjusted = new Uint8ClampedArray(rawMask.length);
    const contrast = s.edgeContrast / 100;
    for (let i = 0; i < rawMask.length; i += 1) {
      let alpha = rawMask[i];
      if (alpha <= s.alphaCutoff) alpha = 0;
      else if (contrast > 0) {
        const normalized = alpha / 255;
        const sharpened = (normalized - 0.5) * (1 + contrast * 1.8) + 0.5;
        alpha = Math.max(0, Math.min(255, Math.round(sharpened * 255)));
      }
      adjusted[i] = alpha;
    }
    return adjusted;
  }

  function buildCandidateMap(item) {
    const { width, height, data } = item.originalImageData;
    const candidates = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        if (item.maskAlpha[pixel] > 80) continue;
        if (originalHasDetail(data, width, x, y)) candidates[pixel] = 1;
      }
    }
    return candidates;
  }

  function originalHasDetail(data, width, x, y) {
    const index = (y * width + x) * 4;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;
    const brightness = (r + g + b) / 3;
    const left = ((y * width + x - 1) * 4);
    const right = ((y * width + x + 1) * 4);
    const up = (((y - 1) * width + x) * 4);
    const down = (((y + 1) * width + x) * 4);
    const horizontal = Math.abs(data[left] - data[right]) + Math.abs(data[left + 1] - data[right + 1]) + Math.abs(data[left + 2] - data[right + 2]);
    const vertical = Math.abs(data[up] - data[down]) + Math.abs(data[up + 1] - data[down + 1]) + Math.abs(data[up + 2] - data[down + 2]);
    const edge = Math.max(horizontal, vertical);
    return brightness > 25 && brightness < 245 && (saturation > 18 || edge > 48);
  }

  async function renderFinalImage(item) {
    if (!item.originalImageData || !item.maskAlpha) return;
    const s = settings();
    const final = await composeOutput(item, s);
    const compare = await composeOutput(item, { ...s, background: "transparent", format: "png" });

    if (item.finalUrl) URL.revokeObjectURL(item.finalUrl);
    if (item.compareUrl) URL.revokeObjectURL(item.compareUrl);
    item.finalBlob = final.blob;
    item.finalUrl = URL.createObjectURL(final.blob);
    item.compareBlob = compare.blob;
    item.compareUrl = URL.createObjectURL(compare.blob);
    item.outputName = makeCleanName(item.file.name, final.format);
    item.renderMap = final.map;
  }

  async function composeOutput(item, s) {
    const { width, height, data } = item.originalImageData;
    const composed = new ImageData(width, height);
    for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
      composed.data[i] = data[i];
      composed.data[i + 1] = data[i + 1];
      composed.data[i + 2] = data[i + 2];
      composed.data[i + 3] = item.maskAlpha[pixel];
    }

    workCanvas.width = width;
    workCanvas.height = height;
    workContext.putImageData(composed, 0, 0);

    const bounds = findAlphaBounds(item.maskAlpha, width, height) || { x: 0, y: 0, width, height };
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

    outputContext.drawImage(workCanvas, bounds.x, bounds.y, bounds.width, bounds.height, drawX, drawY, bounds.width, bounds.height);

    const type = s.format === "jpeg" ? "image/jpeg" : "image/png";
    const blob = await canvasToBlob(outputCanvas, type, 0.92);
    return {
      blob,
      format: s.format,
      map: {
        sourceX: bounds.x,
        sourceY: bounds.y,
        drawX,
        drawY,
        drawWidth: bounds.width,
        drawHeight: bounds.height,
        outputWidth,
        outputHeight
      }
    };
  }

  function findAlphaBounds(alpha, width, height) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (alpha[y * width + x] > 8) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
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
    for (const item of doneItems) await renderFinalImage(item);
    setBusy(false);
    renderAll();
  }

  function canvasPointToSource(event, item) {
    if (!item || !item.renderMap) return null;
    const rect = resultCanvas.getBoundingClientRect();
    const canvasX = (event.clientX - rect.left) * (resultCanvas.width / rect.width);
    const canvasY = (event.clientY - rect.top) * (resultCanvas.height / rect.height);
    const map = item.renderMap;
    if (canvasX < map.drawX || canvasY < map.drawY || canvasX >= map.drawX + map.drawWidth || canvasY >= map.drawY + map.drawHeight) {
      return null;
    }
    return {
      x: Math.round(map.sourceX + canvasX - map.drawX),
      y: Math.round(map.sourceY + canvasY - map.drawY)
    };
  }

  function pushHistory(item) {
    if (!item || !item.maskAlpha) return;
    item.history.push(new Uint8ClampedArray(item.maskAlpha));
    if (item.history.length > HISTORY_LIMIT) item.history.shift();
    item.redo = [];
    updateSaveState();
  }

  function restoreConnectedArea(point) {
    const item = activeItem();
    if (!item || !item.candidateAlpha || !point) return showEditNotice("復元候補がありません");
    const seed = nearestCandidate(item, point.x, point.y, 50);
    if (!seed) return showEditNotice("復元候補がありません");
    const region = connectedCandidateRegion(item, seed.x, seed.y, 80);
    if (!region.length) return showEditNotice("復元候補がありません");
    pushHistory(item);
    region.forEach((pixel) => {
      item.maskAlpha[pixel] = 255;
    });
    renderEditedItem(item);
  }

  function nearestCandidate(item, x, y, radius) {
    const { width, height } = item.originalImageData;
    let best = null;
    let bestDistance = Infinity;
    for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy += 1) {
      for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += 1) {
        const distance = Math.hypot(xx - x, yy - y);
        if (distance > radius || distance >= bestDistance) continue;
        if (item.candidateAlpha[yy * width + xx]) {
          best = { x: xx, y: yy };
          bestDistance = distance;
        }
      }
    }
    return best;
  }

  function connectedCandidateRegion(item, seedX, seedY, maxDistance) {
    const { width, height } = item.originalImageData;
    const seedPixel = seedY * width + seedX;
    const visited = new Uint8Array(width * height);
    const queue = [seedPixel];
    const region = [];
    visited[seedPixel] = 1;

    while (queue.length && region.length < 60000) {
      const pixel = queue.shift();
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (!item.candidateAlpha[pixel]) continue;
      if (Math.hypot(x - seedX, y - seedY) > maxDistance) continue;
      region.push(pixel);

      const neighbors = [pixel - 1, pixel + 1, pixel - width, pixel + width];
      neighbors.forEach((next) => {
        if (next < 0 || next >= visited.length || visited[next]) return;
        const nx = next % width;
        const ny = Math.floor(next / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) return;
        visited[next] = 1;
        queue.push(next);
      });
    }
    return region;
  }

  function applyBrush(point, restore) {
    const item = activeItem();
    if (!item || !point || !item.maskAlpha) return;
    const { size, feather } = brushSettings();
    const radius = size / 2;
    const { width, height } = item.originalImageData;
    for (let y = Math.max(0, Math.floor(point.y - radius)); y <= Math.min(height - 1, Math.ceil(point.y + radius)); y += 1) {
      for (let x = Math.max(0, Math.floor(point.x - radius)); x <= Math.min(width - 1, Math.ceil(point.x + radius)); x += 1) {
        const distance = Math.hypot(x - point.x, y - point.y);
        if (distance > radius) continue;
        const pixel = y * width + x;
        const soft = feather > 0 ? Math.max(0, Math.min(1, (radius - distance) / Math.max(1, feather))) : 1;
        const target = restore ? 255 : 0;
        item.maskAlpha[pixel] = Math.round(item.maskAlpha[pixel] + (target - item.maskAlpha[pixel]) * soft);
      }
    }
    queueRenderEditedItem(item);
  }

  function queueRenderEditedItem(item) {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(async () => {
      renderQueued = false;
      await renderEditedItem(item);
    });
  }

  async function renderEditedItem(item) {
    await renderFinalImage(item);
    item.candidateAlpha = buildCandidateMap(item);
    renderAll();
  }

  function showEditNotice(text) {
    activeFileStatus.textContent = text;
    setTimeout(() => {
      const item = activeItem();
      if (item) activeFileStatus.textContent = statusLabel(item);
    }, 1800);
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
    if (successes.length === 1) return downloadBlob(successes[0].finalBlob, successes[0].outputName);
    if (!window.JSZip) return setGlobalError("ZIP保存ライブラリを読み込めませんでした。ネットワークを確認してください。");
    const zip = new window.JSZip();
    successes.forEach((item) => zip.file(item.outputName, item.finalBlob));
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
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
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

  [outputBackground, marginSize, outputFormat].forEach((control) => {
    control.addEventListener("input", async () => {
      markCustom();
      refreshOutputSummary();
      await rerenderSuccessItems();
    });
  });

  [alphaCutoff, edgeContrast].forEach((control) => {
    control.addEventListener("input", () => {
      markCustom();
      updateLabels();
      showEditNotice("フチ除去と輪郭補正は次回処理またはマスクリセット時に反映します");
    });
  });

  [brushSize, featherSize].forEach((control) => {
    control.addEventListener("input", updateLabels);
  });

  centerObject.addEventListener("change", async () => {
    markCustom();
    refreshOutputSummary();
    await rerenderSuccessItems();
  });

  editMode.addEventListener("change", () => {
    if (editMode.value === "candidate") showCandidates.checked = true;
    renderAll();
  });
  showCandidates.addEventListener("change", renderAll);

  undoButton.addEventListener("click", async () => {
    const item = activeItem();
    if (!item || !item.history.length) return;
    item.redo.push(new Uint8ClampedArray(item.maskAlpha));
    item.maskAlpha = item.history.pop();
    await renderEditedItem(item);
  });

  redoButton.addEventListener("click", async () => {
    const item = activeItem();
    if (!item || !item.redo.length) return;
    item.history.push(new Uint8ClampedArray(item.maskAlpha));
    item.maskAlpha = item.redo.pop();
    await renderEditedItem(item);
  });

  resetMaskButton.addEventListener("click", async () => {
    const item = activeItem();
    if (!item || !item.baseMaskAlpha) return;
    pushHistory(item);
    item.maskAlpha = new Uint8ClampedArray(item.baseMaskAlpha);
    await renderEditedItem(item);
  });

  resultCanvas.addEventListener("pointerdown", (event) => {
    const item = activeItem();
    if (!item || compareMode) return;
    const point = canvasPointToSource(event, item);
    if (editMode.value === "clickRestore") return restoreConnectedArea(point);
    if (editMode.value !== "restoreBrush" && editMode.value !== "eraseBrush") return;
    drawing = true;
    resultCanvas.setPointerCapture(event.pointerId);
    pushHistory(item);
    applyBrush(point, editMode.value === "restoreBrush");
  });

  resultCanvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const item = activeItem();
    applyBrush(canvasPointToSource(event, item), editMode.value === "restoreBrush");
  });

  resultCanvas.addEventListener("pointerup", () => {
    drawing = false;
  });

  resultCanvas.addEventListener("pointercancel", () => {
    drawing = false;
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
