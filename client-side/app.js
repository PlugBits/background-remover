import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.6.0/+esm";

const MAX_DIMENSION = 1800;
const HISTORY_LIMIT = 12;

const fileInput = document.getElementById("fileInput");
const selectButton = document.getElementById("selectButton");
const dropZone = document.getElementById("dropZone");
const statusText = document.getElementById("statusText");
const progressBar = document.getElementById("progressBar");
const toolButtons = document.querySelectorAll("[data-tool]");
const thresholdSlider = document.getElementById("thresholdSlider");
const thresholdValue = document.getElementById("thresholdValue");
const showBoundary = document.getElementById("showBoundary");
const labelInfo = document.getElementById("labelInfo");
const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");
const relabelButton = document.getElementById("relabelButton");
const previewBackground = document.getElementById("previewBackground");
const exportBackground = document.getElementById("exportBackground");
const zoomOutButton = document.getElementById("zoomOutButton");
const zoomResetButton = document.getElementById("zoomResetButton");
const zoomInButton = document.getElementById("zoomInButton");
const saveButton = document.getElementById("saveButton");
const viewport = document.getElementById("canvasViewport");
const stack = document.getElementById("canvasStack");
const outputCanvas = document.getElementById("outputCanvas");
const boundaryCanvas = document.getElementById("boundaryCanvas");
const interactionCanvas = document.getElementById("interactionCanvas");
const outputCtx = outputCanvas.getContext("2d");
const boundaryCtx = boundaryCanvas.getContext("2d");
const interactionCtx = interactionCanvas.getContext("2d");
const emptyState = document.getElementById("emptyState");

const tempCanvas = document.createElement("canvas");
const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });

let currentTool = "toggle";
let state = null;
let zoom = 1;
let panX = 0;
let panY = 0;
let dragging = false;
let dragStart = null;
let lastPointer = null;

function setStatus(text, progress = null) {
  statusText.textContent = text;
  if (progress !== null) progressBar.style.width = `${progress}%`;
}

function setTool(tool) {
  currentTool = tool;
  toolButtons.forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  interactionCanvas.style.cursor = tool === "pan" ? "grab" : "pointer";
}

function setControlsEnabled(enabled) {
  [undoButton, redoButton, relabelButton, zoomOutButton, zoomResetButton, zoomInButton, saveButton].forEach((button) => {
    button.disabled = !enabled;
  });
  updateHistoryButtons();
}

async function loadFile(file) {
  if (!file || !/^image\/(png|jpeg)$/.test(file.type)) {
    setStatus("PNG / JPG / JPEG を選択してください。");
    return;
  }

  setControlsEnabled(false);
  setStatus("画像を読み込んでいます。", 8);

  try {
    const prepared = await prepareImage(file);
    state = {
      fileName: file.name,
      originalImageData: prepared.imageData,
      confidenceMap: null,
      alphaMask: null,
      labelMap: null,
      labels: [],
      history: [],
      redo: [],
      selectedRect: null,
      width: prepared.imageData.width,
      height: prepared.imageData.height
    };

    sizeCanvases(state.width, state.height);
    setStatus("ブラウザ内モデルで背景を除去しています。初回は少し時間がかかります。", 22);
    const removedBlob = await removeBackground(prepared.blob);
    setStatus("アルファマスクを作成しています。", 74);
    await initializeMaskFromBlob(removedBlob);
    relabel();
    resetView();
    renderAll();
    setControlsEnabled(true);
    setStatus("完了しました。島をクリックして前景/背景を切り替えられます。", 100);
  } catch (error) {
    console.error(error);
    setStatus(`処理に失敗しました: ${error.message || error}`, 0);
  }
}

async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  tempCanvas.width = width;
  tempCanvas.height = height;
  tempCtx.clearRect(0, 0, width, height);
  tempCtx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const imageData = tempCtx.getImageData(0, 0, width, height);
  const blob = await canvasToBlob(tempCanvas, "image/png");
  return { imageData, blob };
}

async function initializeMaskFromBlob(blob) {
  const bitmap = await createImageBitmap(blob);
  tempCanvas.width = state.width;
  tempCanvas.height = state.height;
  tempCtx.clearRect(0, 0, state.width, state.height);
  tempCtx.drawImage(bitmap, 0, 0, state.width, state.height);
  bitmap.close();
  const removed = tempCtx.getImageData(0, 0, state.width, state.height);
  state.confidenceMap = new Uint8ClampedArray(state.width * state.height);
  state.alphaMask = new Uint8ClampedArray(state.width * state.height);
  const threshold = Number(thresholdSlider.value);
  for (let i = 0, p = 0; i < removed.data.length; i += 4, p += 1) {
    const alpha = removed.data[i + 3];
    state.confidenceMap[p] = alpha;
    state.alphaMask[p] = alpha >= threshold ? 255 : 0;
  }
}

function sizeCanvases(width, height) {
  [outputCanvas, boundaryCanvas, interactionCanvas].forEach((canvas) => {
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  });
  stack.style.width = `${width}px`;
  stack.style.height = `${height}px`;
  emptyState.hidden = true;
}

function relabel() {
  if (!state) return;
  const { width, height, alphaMask } = state;
  const labelMap = new Int32Array(width * height);
  const labels = [{ id: 0, kind: "none", count: 0 }];
  let nextLabel = 1;
  const queue = [];

  for (let pixel = 0; pixel < alphaMask.length; pixel += 1) {
    if (labelMap[pixel]) continue;
    const kind = alphaMask[pixel] >= 128 ? "fg" : "bg";
    let count = 0;
    labelMap[pixel] = nextLabel;
    queue.push(pixel);

    while (queue.length) {
      const current = queue.pop();
      count += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [];
      if (x > 0) neighbors.push(current - 1);
      if (x < width - 1) neighbors.push(current + 1);
      if (y > 0) neighbors.push(current - width);
      if (y < height - 1) neighbors.push(current + width);

      for (const next of neighbors) {
        if (labelMap[next]) continue;
        const nextKind = alphaMask[next] >= 128 ? "fg" : "bg";
        if (nextKind !== kind) continue;
        labelMap[next] = nextLabel;
        queue.push(next);
      }
    }

    labels[nextLabel] = { id: nextLabel, kind, count };
    nextLabel += 1;
  }

  state.labelMap = labelMap;
  state.labels = labels;
  labelInfo.textContent = `島: ${labels.length - 1}`;
}

function renderAll() {
  renderOutput();
  renderBoundary();
  clearInteraction();
}

function renderOutput() {
  if (!state) return;
  const source = state.originalImageData.data;
  const output = outputCtx.createImageData(state.width, state.height);
  const mode = previewBackground.value;

  if (mode === "original") {
    output.data.set(source);
    outputCtx.putImageData(output, 0, 0);
    return;
  }

  for (let i = 0, p = 0; i < source.length; i += 4, p += 1) {
    if (mode === "compare") {
      const kept = state.alphaMask[p] >= 128;
      output.data[i] = kept ? source[i] : Math.round(source[i] * 0.34 + 255 * 0.66);
      output.data[i + 1] = kept ? source[i + 1] : Math.round(source[i + 1] * 0.34 + 255 * 0.66);
      output.data[i + 2] = kept ? source[i + 2] : Math.round(source[i + 2] * 0.34 + 255 * 0.66);
      output.data[i + 3] = 255;
    } else {
      output.data[i] = source[i];
      output.data[i + 1] = source[i + 1];
      output.data[i + 2] = source[i + 2];
      output.data[i + 3] = state.alphaMask[p];
    }
  }
  outputCtx.putImageData(output, 0, 0);
}

function renderBoundary() {
  boundaryCtx.clearRect(0, 0, boundaryCanvas.width, boundaryCanvas.height);
  if (!state || !showBoundary.checked) return;
  const image = boundaryCtx.createImageData(state.width, state.height);
  for (let y = 1; y < state.height - 1; y += 1) {
    for (let x = 1; x < state.width - 1; x += 1) {
      const p = y * state.width + x;
      const v = state.alphaMask[p] >= 128;
      const edge = (state.alphaMask[p - 1] >= 128) !== v
        || (state.alphaMask[p + 1] >= 128) !== v
        || (state.alphaMask[p - state.width] >= 128) !== v
        || (state.alphaMask[p + state.width] >= 128) !== v;
      if (!edge) continue;
      const i = p * 4;
      image.data[i] = 37;
      image.data[i + 1] = 99;
      image.data[i + 2] = 235;
      image.data[i + 3] = 190;
    }
  }
  boundaryCtx.putImageData(image, 0, 0);
}

function clearInteraction() {
  interactionCtx.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);
}

function highlightLabel(label) {
  clearInteraction();
  if (!state || !label) return;
  const image = interactionCtx.createImageData(state.width, state.height);
  for (let p = 0; p < state.labelMap.length; p += 1) {
    if (state.labelMap[p] !== label) continue;
    const i = p * 4;
    image.data[i] = 0;
    image.data[i + 1] = 132;
    image.data[i + 2] = 255;
    image.data[i + 3] = 88;
  }
  interactionCtx.putImageData(image, 0, 0);
}

function drawSelectionRect(rect) {
  clearInteraction();
  if (!rect) return;
  interactionCtx.fillStyle = "rgba(37, 99, 235, 0.16)";
  interactionCtx.strokeStyle = "rgba(37, 99, 235, 0.95)";
  interactionCtx.lineWidth = Math.max(1, 2 / zoom);
  interactionCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
  interactionCtx.strokeRect(rect.x, rect.y, rect.w, rect.h);
}

function toggleLabel(label) {
  if (!state || !label) return;
  const info = state.labels[label];
  if (!info) return;
  const total = state.width * state.height;
  if (info.kind === "bg" && info.count > total * 0.35) {
    setStatus("大きな背景領域です。矩形選択で必要範囲だけ前景化してください。");
    return;
  }
  pushHistory();
  const target = info.kind === "fg" ? 0 : 255;
  for (let p = 0; p < state.labelMap.length; p += 1) {
    if (state.labelMap[p] === label) state.alphaMask[p] = target;
  }
  relabel();
  renderAll();
  setStatus(info.kind === "fg" ? "選択した島を透明化しました。" : "選択した島を復元しました。");
}

function applyRect(rect, mode) {
  if (!state || !rect) return;
  const x1 = clamp(Math.floor(Math.min(rect.x, rect.x + rect.w)), 0, state.width - 1);
  const x2 = clamp(Math.ceil(Math.max(rect.x, rect.x + rect.w)), 0, state.width - 1);
  const y1 = clamp(Math.floor(Math.min(rect.y, rect.y + rect.h)), 0, state.height - 1);
  const y2 = clamp(Math.ceil(Math.max(rect.y, rect.y + rect.h)), 0, state.height - 1);
  const threshold = Number(thresholdSlider.value);
  pushHistory();
  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) {
      const p = y * state.width + x;
      if (mode === "fg") state.alphaMask[p] = 255;
      else if (mode === "bg") state.alphaMask[p] = 0;
      else state.alphaMask[p] = state.confidenceMap[p] >= threshold ? 255 : 0;
    }
  }
  relabel();
  renderAll();
  setStatus("選択範囲を更新しました。");
}

function canvasPoint(event) {
  const rect = interactionCanvas.getBoundingClientRect();
  return {
    x: clamp(Math.floor((event.clientX - rect.left) * (interactionCanvas.width / rect.width)), 0, state.width - 1),
    y: clamp(Math.floor((event.clientY - rect.top) * (interactionCanvas.height / rect.height)), 0, state.height - 1)
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pushHistory() {
  if (!state) return;
  state.history.push(new Uint8ClampedArray(state.alphaMask));
  if (state.history.length > HISTORY_LIMIT) state.history.shift();
  state.redo = [];
  updateHistoryButtons();
}

function updateHistoryButtons() {
  undoButton.disabled = !state || state.history.length === 0;
  redoButton.disabled = !state || state.redo.length === 0;
}

function resetView() {
  const bounds = viewportBounds();
  zoom = Math.min(1, Math.min(bounds.width / state.width, bounds.height / state.height));
  panX = bounds.left + (bounds.width - state.width * zoom) / 2;
  panY = bounds.top + (bounds.height - state.height * zoom) / 2;
  applyTransform();
}

function viewportBounds() {
  const padding = 24;
  return {
    left: padding,
    top: padding,
    width: Math.max(1, viewport.clientWidth - padding * 2),
    height: Math.max(1, viewport.clientHeight - padding * 2)
  };
}

function applyTransform() {
  stack.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  zoomResetButton.textContent = `${Math.round(zoom * 100)}%`;
}

function zoomAtCenter(nextZoom) {
  if (!state) return;
  const bounds = viewportBounds();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const imageX = (centerX - panX) / zoom;
  const imageY = (centerY - panY) / zoom;
  zoom = Math.max(0.1, Math.min(8, nextZoom));
  panX = centerX - imageX * zoom;
  panY = centerY - imageY * zoom;
  applyTransform();
}

async function exportPng() {
  if (!state) return;
  const bg = exportBackground.value;
  tempCanvas.width = state.width;
  tempCanvas.height = state.height;
  tempCtx.clearRect(0, 0, state.width, state.height);
  if (bg !== "transparent") {
    tempCtx.fillStyle = bg === "black" ? "#111827" : bg === "gray" ? "#8f99a8" : "#ffffff";
    tempCtx.fillRect(0, 0, state.width, state.height);
  }
  tempCtx.drawImage(outputCanvas, 0, 0);
  const blob = await canvasToBlob(tempCanvas, "image/png");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = state.fileName.replace(/\.[^.]+$/, "_client_clean.png");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("画像の変換に失敗しました。"));
    }, type);
  });
}

selectButton.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("click", (event) => {
  if (event.target !== selectButton) fileInput.click();
});
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  loadFile(event.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  loadFile(fileInput.files[0]);
  fileInput.value = "";
});

toolButtons.forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});

interactionCanvas.addEventListener("pointermove", (event) => {
  if (!state) return;
  const point = canvasPoint(event);
  if (dragging && currentTool === "pan") {
    panX += event.clientX - lastPointer.x;
    panY += event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    applyTransform();
    return;
  }
  if (dragging && dragStart) {
    drawSelectionRect({ x: dragStart.x, y: dragStart.y, w: point.x - dragStart.x, h: point.y - dragStart.y });
    return;
  }
  if (currentTool === "toggle") {
    const label = state.labelMap[point.y * state.width + point.x];
    highlightLabel(label);
    const info = state.labels[label];
    labelInfo.textContent = info ? `島: ${label} / ${info.kind === "fg" ? "前景" : "背景"} / ${info.count}px` : `島: -`;
  }
});

interactionCanvas.addEventListener("pointerdown", (event) => {
  if (!state) return;
  interactionCanvas.setPointerCapture(event.pointerId);
  dragging = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  if (currentTool === "pan") return;
  const point = canvasPoint(event);
  if (currentTool === "toggle") {
    toggleLabel(state.labelMap[point.y * state.width + point.x]);
    dragging = false;
    return;
  }
  dragStart = point;
});

interactionCanvas.addEventListener("pointerup", (event) => {
  if (!state) return;
  if (dragging && dragStart && currentTool !== "pan" && currentTool !== "toggle") {
    const point = canvasPoint(event);
    const rect = { x: dragStart.x, y: dragStart.y, w: point.x - dragStart.x, h: point.y - dragStart.y };
    if (Math.abs(rect.w) > 2 && Math.abs(rect.h) > 2) {
      if (currentTool === "rectFg") applyRect(rect, "fg");
      if (currentTool === "rectBg") applyRect(rect, "bg");
      if (currentTool === "threshold") applyRect(rect, "threshold");
    }
  }
  dragging = false;
  dragStart = null;
});

interactionCanvas.addEventListener("pointercancel", () => {
  dragging = false;
  dragStart = null;
});

thresholdSlider.addEventListener("input", () => {
  thresholdValue.textContent = thresholdSlider.value;
});

showBoundary.addEventListener("change", renderBoundary);
previewBackground.addEventListener("change", () => {
  const mode = previewBackground.value;
  viewport.className = `canvas-viewport ${["original", "compare"].includes(mode) ? "checker" : mode}`;
  renderAll();
});
undoButton.addEventListener("click", () => {
  if (!state || !state.history.length) return;
  state.redo.push(new Uint8ClampedArray(state.alphaMask));
  state.alphaMask = state.history.pop();
  relabel();
  renderAll();
  updateHistoryButtons();
});
redoButton.addEventListener("click", () => {
  if (!state || !state.redo.length) return;
  state.history.push(new Uint8ClampedArray(state.alphaMask));
  state.alphaMask = state.redo.pop();
  relabel();
  renderAll();
  updateHistoryButtons();
});
relabelButton.addEventListener("click", () => {
  relabel();
  renderAll();
  setStatus("島を再計算しました。");
});
zoomOutButton.addEventListener("click", () => {
  zoomAtCenter(zoom / 1.25);
});
zoomInButton.addEventListener("click", () => {
  zoomAtCenter(zoom * 1.25);
});
zoomResetButton.addEventListener("click", resetView);
saveButton.addEventListener("click", exportPng);
