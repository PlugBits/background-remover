import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.6.0/+esm";

const MAX_DIMENSION = 1800;
const HISTORY_LIMIT = 12;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 10;

const fileInput = document.getElementById("fileInput");
const selectButton = document.getElementById("selectButton");
const dropZone = document.getElementById("dropZone");
const statusText = document.getElementById("statusText");
const progressBar = document.getElementById("progressBar");
const toolButtons = document.querySelectorAll("[data-tool]");
const previewButtons = document.querySelectorAll("[data-preview]");
const thresholdSlider = document.getElementById("thresholdSlider");
const thresholdValue = document.getElementById("thresholdValue");
const showBoundary = document.getElementById("showBoundary");
const labelInfo = document.getElementById("labelInfo");
const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");
const relabelButton = document.getElementById("relabelButton");
const canvasActions = document.getElementById("canvasActions");
const applyPolygonButton = document.getElementById("applyPolygonButton");
const undoPointButton = document.getElementById("undoPointButton");
const clearPolygonButton = document.getElementById("clearPolygonButton");
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
const emptyState = document.getElementById("emptyState");

const outputCtx = outputCanvas.getContext("2d");
const boundaryCtx = boundaryCanvas.getContext("2d");
const interactionCtx = interactionCanvas.getContext("2d");
const tempCanvas = document.createElement("canvas");
const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });

let state = null;
let currentTool = "toggle";
let previewMode = "compare";
let zoom = 1;
let panX = 0;
let panY = 0;
let dragging = false;
let rightButtonPanning = false;
let dragStart = null;
let lastPointer = null;
let polygonPoints = [];

function setStatus(text, progress = null) {
  statusText.textContent = text;
  if (progress !== null) progressBar.style.width = `${progress}%`;
}

function setTool(tool) {
  currentTool = tool;
  toolButtons.forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  updateCanvasCursor();
  clearPolygon();
  updateCanvasActions();
}

function updateCanvasCursor() {
  if (rightButtonPanning) {
    interactionCanvas.style.cursor = "grabbing";
  } else {
    interactionCanvas.style.cursor = currentTool === "pan" ? "grab" : "pointer";
  }
}

function setControlsEnabled(enabled) {
  [relabelButton, zoomOutButton, zoomResetButton, zoomInButton, saveButton].forEach((button) => {
    button.disabled = !enabled;
  });
  updateHistoryButtons();
  updatePolygonButtons();
}

async function loadFile(file) {
  if (!file || !/^image\/(png|jpeg)$/.test(file.type)) {
    setStatus("PNG / JPG / JPEG を選択してください。");
    return;
  }

  setControlsEnabled(false);
  clearPolygon();
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
      width: prepared.imageData.width,
      height: prepared.imageData.height
    };

    sizeCanvases(state.width, state.height);
    setStatus("ブラウザ内モデルで背景を削除しています。初回は少し時間がかかります。", 24);
    const removedBlob = await removeBackground(prepared.blob);
    setStatus("マスクを作成しています。", 74);
    await initializeMaskFromBlob(removedBlob);
    relabel();
    await nextFrame();
    resetView();
    renderAll();
    setControlsEnabled(true);
    setStatus("完了しました。点で囲んで戻す/消す、または島を切替できます。", 100);
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
  const threshold = Number(thresholdSlider.value);
  state.confidenceMap = new Uint8ClampedArray(state.width * state.height);
  state.alphaMask = new Uint8ClampedArray(state.width * state.height);
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
  renderInteraction();
}

function renderOutput() {
  if (!state) return;
  const source = state.originalImageData.data;
  const output = outputCtx.createImageData(state.width, state.height);

  if (previewMode === "original") {
    output.data.set(source);
    outputCtx.putImageData(output, 0, 0);
    return;
  }

  for (let i = 0, p = 0; i < source.length; i += 4, p += 1) {
    if (previewMode === "compare") {
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
  if (!state || !showBoundary.checked || previewMode === "original") return;
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

function renderInteraction() {
  interactionCtx.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);
  drawPolygonGuide();
}

function highlightLabel(label) {
  interactionCtx.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);
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
  renderInteraction();
  if (!rect) return;
  interactionCtx.fillStyle = "rgba(37, 99, 235, 0.16)";
  interactionCtx.strokeStyle = "rgba(37, 99, 235, 0.95)";
  interactionCtx.lineWidth = Math.max(1, 2 / zoom);
  interactionCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
  interactionCtx.strokeRect(rect.x, rect.y, rect.w, rect.h);
}

function drawPolygonGuide() {
  updatePolygonButtons();
  if (!polygonPoints.length) return;
  interactionCtx.save();
  interactionCtx.lineWidth = Math.max(2, 2 / zoom);
  interactionCtx.strokeStyle = "rgba(37, 99, 235, 0.95)";
  interactionCtx.fillStyle = "rgba(37, 99, 235, 0.14)";
  interactionCtx.beginPath();
  interactionCtx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
  for (let i = 1; i < polygonPoints.length; i += 1) {
    interactionCtx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
  }
  if (polygonPoints.length >= 3) {
    interactionCtx.closePath();
    interactionCtx.fill();
  }
  interactionCtx.stroke();
  polygonPoints.forEach((point, index) => {
    interactionCtx.beginPath();
    interactionCtx.fillStyle = index === 0 ? "#16a34a" : "#2563eb";
    interactionCtx.arc(point.x, point.y, Math.max(4, 5 / zoom), 0, Math.PI * 2);
    interactionCtx.fill();
  });
  interactionCtx.restore();
}

function updateCanvasActions() {
  const polygonMode = currentTool === "polyFg" || currentTool === "polyBg";
  canvasActions.hidden = !polygonMode;
  updatePolygonButtons();
}

function updatePolygonButtons() {
  const active = currentTool === "polyFg" || currentTool === "polyBg";
  applyPolygonButton.disabled = !state || !active || polygonPoints.length < 3;
  undoPointButton.disabled = !state || !active || polygonPoints.length === 0;
  clearPolygonButton.disabled = !state || !active || polygonPoints.length === 0;
}

function toggleLabel(label) {
  if (!state || !label) return;
  const info = state.labels[label];
  if (!info) return;
  const total = state.width * state.height;
  if (info.kind === "bg" && info.count > total * 0.35) {
    setStatus("大きな背景領域です。必要な部分だけ点で囲んで戻してください。");
    return;
  }
  pushHistory();
  const target = info.kind === "fg" ? 0 : 255;
  for (let p = 0; p < state.labelMap.length; p += 1) {
    if (state.labelMap[p] === label) state.alphaMask[p] = target;
  }
  relabel();
  renderAll();
  setStatus(info.kind === "fg" ? "選択した島を消しました。" : "選択した島を戻しました。");
}

function applyRectThreshold(rect) {
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
      state.alphaMask[p] = state.confidenceMap[p] >= threshold ? 255 : 0;
    }
  }
  relabel();
  renderAll();
  setStatus("選択範囲のしきい値を更新しました。");
}

function applyPolygon(mode) {
  if (!state || polygonPoints.length < 3) return;
  const bounds = polygonBounds(polygonPoints);
  const targetAlpha = mode === "bg" ? 0 : 255;
  pushHistory();
  for (let y = bounds.y1; y <= bounds.y2; y += 1) {
    const intersections = polygonIntersections(y + 0.5, polygonPoints);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const xStart = clamp(Math.floor(intersections[i]), 0, state.width - 1);
      const xEnd = clamp(Math.ceil(intersections[i + 1]), 0, state.width - 1);
      for (let x = xStart; x <= xEnd; x += 1) {
        state.alphaMask[y * state.width + x] = targetAlpha;
      }
    }
  }
  relabel();
  renderAll();
  clearPolygon();
  setStatus(mode === "fg" ? "囲んだ内側をすべて戻しました。" : "囲んだ内側をすべて消しました。");
}

function polygonBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x1: clamp(Math.floor(Math.min(...xs)), 0, state.width - 1),
    x2: clamp(Math.ceil(Math.max(...xs)), 0, state.width - 1),
    y1: clamp(Math.floor(Math.min(...ys)), 0, state.height - 1),
    y2: clamp(Math.ceil(Math.max(...ys)), 0, state.height - 1)
  };
}

function polygonIntersections(y, points) {
  const xs = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
  }
  return xs.sort((a, b) => a - b);
}

function addPolygonPoint(point) {
  polygonPoints.push(point);
  renderInteraction();
}

function clearPolygon() {
  polygonPoints = [];
  renderInteraction();
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
  if (!state) return;
  const bounds = viewportBounds();
  const fit = Math.min(bounds.width / state.width, bounds.height / state.height);
  zoom = Math.min(1, Math.max(MIN_ZOOM, fit));
  panX = bounds.left + (bounds.width - state.width * zoom) / 2;
  panY = bounds.top + (bounds.height - state.height * zoom) / 2;
  applyTransform();
}

function viewportBounds() {
  const rect = viewport.getBoundingClientRect();
  const side = 24;
  const top = 76;
  const bottom = 64;
  return {
    left: side,
    top,
    width: Math.max(1, rect.width - side * 2),
    height: Math.max(1, rect.height - top - bottom)
  };
}

function applyTransform() {
  stack.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  zoomResetButton.textContent = `${Math.round(zoom * 100)}%`;
}

function zoomAtCenter(nextZoom) {
  if (!state) return;
  const bounds = viewportBounds();
  zoomAtViewportPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, nextZoom);
}

function zoomAtViewportPoint(viewportX, viewportY, nextZoom) {
  const imageX = (viewportX - panX) / zoom;
  const imageY = (viewportY - panY) / zoom;
  zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  panX = viewportX - imageX * zoom;
  panY = viewportY - imageY * zoom;
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
  const previousMode = previewMode;
  previewMode = "checker";
  renderOutput();
  tempCtx.drawImage(outputCanvas, 0, 0);
  previewMode = previousMode;
  renderOutput();
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

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
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

previewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    previewMode = button.dataset.preview;
    previewButtons.forEach((item) => item.classList.toggle("active", item === button));
    viewport.className = `canvas-viewport ${["original", "compare"].includes(previewMode) ? "checker" : previewMode}`;
    renderAll();
  });
});

viewport.addEventListener("wheel", (event) => {
  if (!state) return;
  event.preventDefault();
  const rect = viewport.getBoundingClientRect();
  const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
  zoomAtViewportPoint(event.clientX - rect.left, event.clientY - rect.top, zoom * factor);
}, { passive: false });

interactionCanvas.addEventListener("pointermove", (event) => {
  if (!state) return;
  const point = canvasPoint(event);
  if (dragging && (currentTool === "pan" || rightButtonPanning)) {
    panX += event.clientX - lastPointer.x;
    panY += event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    applyTransform();
    return;
  }
  if (dragging && dragStart && currentTool === "threshold") {
    drawSelectionRect({ x: dragStart.x, y: dragStart.y, w: point.x - dragStart.x, h: point.y - dragStart.y });
    return;
  }
  if (currentTool === "polyFg" || currentTool === "polyBg") {
    renderInteraction();
    if (polygonPoints.length) {
      interactionCtx.save();
      interactionCtx.strokeStyle = "rgba(37, 99, 235, 0.55)";
      interactionCtx.lineWidth = Math.max(1, 1 / zoom);
      const last = polygonPoints[polygonPoints.length - 1];
      interactionCtx.beginPath();
      interactionCtx.moveTo(last.x, last.y);
      interactionCtx.lineTo(point.x, point.y);
      interactionCtx.stroke();
      interactionCtx.restore();
    }
    return;
  }
  if (currentTool === "toggle") {
    const label = state.labelMap[point.y * state.width + point.x];
    highlightLabel(label);
    const info = state.labels[label];
    labelInfo.textContent = info ? `島: ${label} / ${info.kind === "fg" ? "前景" : "背景"} / ${info.count}px` : "島: -";
  }
});

interactionCanvas.addEventListener("pointerdown", (event) => {
  if (!state) return;
  interactionCanvas.setPointerCapture(event.pointerId);
  dragging = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  if (event.button === 2) {
    rightButtonPanning = true;
    updateCanvasCursor();
    return;
  }
  if (event.button !== 0) {
    dragging = false;
    return;
  }
  if (currentTool === "pan") return;
  const point = canvasPoint(event);
  if (currentTool === "polyFg" || currentTool === "polyBg") {
    addPolygonPoint(point);
    dragging = false;
    return;
  }
  if (currentTool === "toggle") {
    toggleLabel(state.labelMap[point.y * state.width + point.x]);
    dragging = false;
    return;
  }
  if (currentTool === "threshold") dragStart = point;
});

interactionCanvas.addEventListener("pointerup", (event) => {
  if (!state) return;
  if (dragging && dragStart && currentTool === "threshold") {
    const point = canvasPoint(event);
    const rect = { x: dragStart.x, y: dragStart.y, w: point.x - dragStart.x, h: point.y - dragStart.y };
    if (Math.abs(rect.w) > 2 && Math.abs(rect.h) > 2) applyRectThreshold(rect);
  }
  dragging = false;
  rightButtonPanning = false;
  updateCanvasCursor();
  dragStart = null;
});

interactionCanvas.addEventListener("dblclick", () => {
  if (currentTool === "polyFg") applyPolygon("fg");
  if (currentTool === "polyBg") applyPolygon("bg");
});

interactionCanvas.addEventListener("pointercancel", () => {
  dragging = false;
  rightButtonPanning = false;
  updateCanvasCursor();
  dragStart = null;
});

interactionCanvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

thresholdSlider.addEventListener("input", () => {
  thresholdValue.textContent = thresholdSlider.value;
});
showBoundary.addEventListener("change", renderBoundary);
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
applyPolygonButton.addEventListener("click", () => {
  if (currentTool === "polyFg") applyPolygon("fg");
  if (currentTool === "polyBg") applyPolygon("bg");
});
undoPointButton.addEventListener("click", () => {
  polygonPoints.pop();
  renderInteraction();
});
clearPolygonButton.addEventListener("click", clearPolygon);
zoomOutButton.addEventListener("click", () => zoomAtCenter(zoom / 1.25));
zoomInButton.addEventListener("click", () => zoomAtCenter(zoom * 1.25));
zoomResetButton.addEventListener("click", resetView);
saveButton.addEventListener("click", exportPng);
window.addEventListener("resize", () => {
  if (!state) return;
  resetView();
});
