(function () {
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg"]);
  const CONFIG = window.BACKGROUND_REMOVER_CONFIG || {};

  const fileInput = document.getElementById("fileInput");
  const selectButton = document.getElementById("selectButton");
  const dropZone = document.getElementById("dropZone");
  const message = document.getElementById("message");
  const emptyState = document.getElementById("emptyState");
  const previewGrid = document.getElementById("previewGrid");
  const originalImage = document.getElementById("originalImage");
  const resultImage = document.getElementById("resultImage");
  const resultBadge = document.getElementById("resultBadge");
  const processingOverlay = document.getElementById("processingOverlay");
  const downloadButton = document.getElementById("downloadButton");
  const previewStage = document.getElementById("previewStage");
  const bgButtons = document.querySelectorAll("[data-preview-bg]");
  const adjustPanel = document.getElementById("adjustPanel");
  const alphaCutoff = document.getElementById("alphaCutoff");
  const edgeContrast = document.getElementById("edgeContrast");
  const alphaCutoffValue = document.getElementById("alphaCutoffValue");
  const edgeContrastValue = document.getElementById("edgeContrastValue");
  const resetAdjustButton = document.getElementById("resetAdjustButton");

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  let originalUrl = "";
  let adjustedUrl = "";
  let resultBlob = null;
  let sourceImageData = null;
  let resultFileName = "background-removed.png";

  function setMessage(text, type) {
    message.textContent = text;
    message.className = type ? `message ${type}` : "message";
  }

  function setBusy(isBusy) {
    selectButton.disabled = isBusy;
    downloadButton.disabled = isBusy || !resultBlob;
    dropZone.setAttribute("aria-busy", String(isBusy));
    processingOverlay.hidden = !isBusy;
    if (isBusy) resultBadge.textContent = "処理中";
  }

  function validateFile(file) {
    if (!file) return "画像ファイルを選択してください。";
    if (!ACCEPTED_TYPES.has(file.type)) return "PNG / JPG / JPEG の画像を選択してください。";
    if (file.size > MAX_FILE_SIZE) return "画像サイズは 5MB 以下にしてください。";
    return "";
  }

  function getEndpoint() {
    return String(CONFIG.apiEndpoint || "").trim();
  }

  function makeDownloadName(fileName) {
    const baseName = fileName.replace(/\.[^.]+$/, "") || "image";
    return `${baseName}-transparent.png`;
  }

  function revokePreviewUrls() {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (adjustedUrl) URL.revokeObjectURL(adjustedUrl);
    originalUrl = "";
    adjustedUrl = "";
  }

  function showOriginal(file) {
    revokePreviewUrls();
    originalUrl = URL.createObjectURL(file);
    originalImage.src = originalUrl;
    resultImage.hidden = true;
    resultImage.removeAttribute("src");
    emptyState.hidden = true;
    previewGrid.hidden = false;
    adjustPanel.hidden = true;
    resultBlob = null;
    sourceImageData = null;
    resetAdjustments();
  }

  function resetAdjustments() {
    alphaCutoff.value = "0";
    edgeContrast.value = "0";
    updateSliderLabels();
  }

  function updateSliderLabels() {
    alphaCutoffValue.textContent = alphaCutoff.value;
    edgeContrastValue.textContent = edgeContrast.value;
  }

  async function captureSourceImageData(blob) {
    const bitmap = await createImageBitmap(blob);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    sourceImageData = context.getImageData(0, 0, canvas.width, canvas.height);
    bitmap.close();
  }

  function applyAdjustments() {
    if (!sourceImageData) return Promise.resolve();

    const cutoff = Number(alphaCutoff.value);
    const contrast = Number(edgeContrast.value) / 100;
    const adjusted = new ImageData(
      new Uint8ClampedArray(sourceImageData.data),
      sourceImageData.width,
      sourceImageData.height
    );

    for (let index = 3; index < adjusted.data.length; index += 4) {
      let alpha = adjusted.data[index];
      if (alpha <= cutoff) {
        alpha = 0;
      } else if (contrast > 0) {
        const normalized = alpha / 255;
        const sharpened = (normalized - 0.5) * (1 + contrast * 1.8) + 0.5;
        alpha = Math.max(0, Math.min(255, Math.round(sharpened * 255)));
      }
      adjusted.data[index] = alpha;
    }

    context.putImageData(adjusted, 0, 0);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve();
          return;
        }
        if (adjustedUrl) URL.revokeObjectURL(adjustedUrl);
        adjustedUrl = URL.createObjectURL(blob);
        resultBlob = blob;
        resultImage.src = adjustedUrl;
        resultImage.hidden = false;
        resultBadge.textContent = "調整できます";
        downloadButton.disabled = false;
        resolve();
      }, "image/png");
    });
  }

  async function removeBackground(file) {
    const validationError = validateFile(file);
    if (validationError) {
      setMessage(validationError, "error");
      return;
    }

    const endpoint = getEndpoint();
    if (!endpoint) {
      setMessage("API URL が未設定です。管理者に確認してください。", "error");
      return;
    }

    showOriginal(file);
    resultFileName = makeDownloadName(file.name);

    const formData = new FormData();
    formData.append("file", file);

    setBusy(true);
    setMessage("元画像を表示しました。背景を削除しています。", "");

    try {
      const response = await fetch(endpoint, {
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

      await captureSourceImageData(blob);
      await applyAdjustments();
      adjustPanel.hidden = false;
      setMessage("透過PNGを作成しました。必要なら仕上げ調整をしてください。", "success");
    } catch (error) {
      resultBadge.textContent = "失敗";
      setMessage(`処理に失敗しました: ${error.message}`, "error");
    } finally {
      setBusy(false);
    }
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

  fileInput.addEventListener("change", () => {
    removeBackground(fileInput.files[0]);
    fileInput.value = "";
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
    removeBackground(event.dataTransfer.files[0]);
  });

  downloadButton.addEventListener("click", () => {
    if (!resultBlob) return;
    const link = document.createElement("a");
    link.href = adjustedUrl;
    link.download = resultFileName;
    link.click();
  });

  alphaCutoff.addEventListener("input", () => {
    updateSliderLabels();
    applyAdjustments();
  });

  edgeContrast.addEventListener("input", () => {
    updateSliderLabels();
    applyAdjustments();
  });

  resetAdjustButton.addEventListener("click", () => {
    resetAdjustments();
    applyAdjustments();
  });

  bgButtons.forEach((button) => {
    button.addEventListener("click", () => {
      bgButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      previewStage.className = `preview-stage ${button.dataset.previewBg}`;
    });
  });

  updateSliderLabels();
})();
