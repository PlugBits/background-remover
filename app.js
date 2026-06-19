import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.6.0/+esm";

const MAX_DIMENSION = 1800;
const HISTORY_LIMIT = 12;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 10;
const INITIAL_ALPHA_THRESHOLD = 128;
const OUTPUT_PADDING = 12;
const HISTORY_DB_NAME = "product-photo-cleaner-history";
const HISTORY_DB_VERSION = 1;
const HISTORY_STORE = "items";
const MAX_SAVED_HISTORY = 20;
const HISTORY_ENABLED_KEY = "productPhotoCleaner.historyEnabled";

const fileInput = document.getElementById("fileInput");
const selectButton = document.getElementById("selectButton");
const dropZone = document.getElementById("dropZone");
const statusText = document.getElementById("statusText");
const progressBar = document.getElementById("progressBar");
const toolButtons = document.querySelectorAll("[data-tool]");
const previewButtons = document.querySelectorAll("[data-preview]");
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
const outputSize = document.getElementById("outputSize");
const zoomOutButton = document.getElementById("zoomOutButton");
const zoomResetButton = document.getElementById("zoomResetButton");
const zoomInButton = document.getElementById("zoomInButton");
const rotateButtons = document.querySelectorAll("[data-rotate]");
const rotateAngleLabel = document.getElementById("rotateAngleLabel");
const copyButton = document.getElementById("copyButton");
const saveButton = document.getElementById("saveButton");
const historyEnabled = document.getElementById("historyEnabled");
const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");
const clearHistoryButton = document.getElementById("clearHistoryButton");
const viewport = document.getElementById("canvasViewport");
const stack = document.getElementById("canvasStack");
const outputCanvas = document.getElementById("outputCanvas");
const boundaryCanvas = document.getElementById("boundaryCanvas");
const interactionCanvas = document.getElementById("interactionCanvas");
const emptyState = document.getElementById("emptyState");
const toast = document.getElementById("toast");

const outputCtx = outputCanvas.getContext("2d");
const boundaryCtx = boundaryCanvas.getContext("2d");
const interactionCtx = interactionCanvas.getContext("2d");
const tempCanvas = document.createElement("canvas");
const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });

let state = null;
let currentTool = "pan";
let previewMode = "compare";
let rotationAngle = 0;
let zoom = 1;
let panX = 0;
let panY = 0;
let dragging = false;
let rightButtonPanning = false;
let lastPointer = null;
let polygonPoints = [];
let toastTimer = null;
let historyDbPromise = null;
let historyPreviewUrls = [];

function setStatus(text, progress = null) {
  statusText.textContent = text;
  if (progress !== null) progressBar.style.width = `${progress}%`;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2000);
}

function setTool(tool) {
  currentTool = tool;
  toolButtons.forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  updateCanvasCursor();
  clearPolygon();
  updateCanvasActions();
}

function updateCanvasCursor() {
  const cursor = currentTool === "pan" ? "grab" : "pointer";
  if (rightButtonPanning) {
    interactionCanvas.style.cursor = "grabbing";
    viewport.style.cursor = "grabbing";
  } else {
    interactionCanvas.style.cursor = cursor;
    viewport.style.cursor = cursor;
  }
}

function setControlsEnabled(enabled) {
  [relabelButton, zoomOutButton, zoomResetButton, zoomInButton, ...rotateButtons, copyButton, saveButton].forEach((button) => {
    button.disabled = !enabled;
  });
  updateHistoryButtons();
  updatePolygonButtons();
}

async function loadFile(file) {
  if (!file || !/^image\/(png|jpeg)$/.test(file.type)) {
    showToast("PNG / JPG / JPEG を選択してください。");
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
    rotationAngle = 0;
    rotateAngleLabel.textContent = "0°";

    sizeCanvases(state.width, state.height);
    setStatus("ブラウザ内モデルで背景を削除しています。", 24);
    const removedBlob = await removeBackground(prepared.blob);
    setStatus("マスクを作成しています。", 74);
    await initializeMaskFromBlob(removedBlob);
    relabel();
    await nextFrame();
    resetView();
    renderAll();
    setControlsEnabled(true);
    setTool("pan");
    setStatus("処理完了", 100);
    showToast("背景削除が完了しました。");
  } catch (error) {
    console.error(error);
    setStatus("処理に失敗しました。", 0);
    showToast(`処理に失敗しました: ${error.message || error}`);
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
  for (let i = 0, p = 0; i < removed.data.length; i += 4, p += 1) {
    const alpha = removed.data[i + 3];
    state.confidenceMap[p] = alpha;
    state.alphaMask[p] = alpha >= INITIAL_ALPHA_THRESHOLD ? 255 : 0;
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

function drawPolygonGuide() {
  updatePolygonButtons();
  if (!polygonPoints.length) return;
  interactionCtx.save();
  const pointRadius = 6 / zoom;
  interactionCtx.lineWidth = 2 / zoom;
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
    interactionCtx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
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
    showToast("大きな背景領域です。必要な部分だけ点で囲んで戻してください。");
    return;
  }
  pushHistory();
  const target = info.kind === "fg" ? 0 : 255;
  for (let p = 0; p < state.labelMap.length; p += 1) {
    if (state.labelMap[p] === label) state.alphaMask[p] = target;
  }
  relabel();
  renderAll();
  showToast(info.kind === "fg" ? "選択した島を消しました。" : "選択した島を戻しました。");
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
  showToast(mode === "fg" ? "囲んだ内側をすべて戻しました。" : "囲んだ内側をすべて消しました。");
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
  const rawX = (event.clientX - rect.left) * (interactionCanvas.width / rect.width);
  const rawY = (event.clientY - rect.top) * (interactionCanvas.height / rect.height);
  return {
    x: clamp(Math.floor(rawX), 0, state.width - 1),
    y: clamp(Math.floor(rawY), 0, state.height - 1),
    inside: rawX >= 0 && rawX < state.width && rawY >= 0 && rawY < state.height
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

function undoMaskEdit() {
  if (!state || !state.history.length) return;
  state.redo.push(new Uint8ClampedArray(state.alphaMask));
  state.alphaMask = state.history.pop();
  relabel();
  renderAll();
  updateHistoryButtons();
}

function redoMaskEdit() {
  if (!state || !state.redo.length) return;
  state.history.push(new Uint8ClampedArray(state.alphaMask));
  state.alphaMask = state.redo.pop();
  relabel();
  renderAll();
  updateHistoryButtons();
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

function rotateCurrentImage(degrees) {
  if (!state) return;
  clearPolygon();
  const smooth = Math.abs(degrees) % 90 !== 0;
  const rotatedOriginal = rotateImageData(state.originalImageData, degrees, smooth);
  const rotatedConfidence = rotateAlphaArray(state.confidenceMap, state.width, state.height, degrees, smooth);
  const rotatedMask = rotateAlphaArray(state.alphaMask, state.width, state.height, degrees, smooth);
  state.originalImageData = rotatedOriginal.imageData;
  state.confidenceMap = rotatedConfidence.alpha;
  state.alphaMask = rotatedMask.alpha.map((alpha) => (alpha >= 128 ? 255 : 0));
  state.width = rotatedOriginal.width;
  state.height = rotatedOriginal.height;
  state.history = [];
  state.redo = [];
  rotationAngle = normalizeAngle(rotationAngle + degrees);
  rotateAngleLabel.textContent = `${rotationAngle}°`;
  sizeCanvases(state.width, state.height);
  relabel();
  resetView();
  renderAll();
  updateHistoryButtons();
}

function rotateImageData(imageData, degrees, smooth) {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = imageData.width;
  sourceCanvas.height = imageData.height;
  sourceCanvas.getContext("2d").putImageData(imageData, 0, 0);
  const rotated = rotateCanvas(sourceCanvas, degrees, smooth);
  const rotatedData = rotated.ctx.getImageData(0, 0, rotated.width, rotated.height);
  return { imageData: rotatedData, width: rotated.width, height: rotated.height };
}

function rotateAlphaArray(alphaArray, width, height, degrees, smooth) {
  const image = new ImageData(width, height);
  for (let p = 0, i = 0; p < alphaArray.length; p += 1, i += 4) {
    image.data[i] = 255;
    image.data[i + 1] = 255;
    image.data[i + 2] = 255;
    image.data[i + 3] = alphaArray[p];
  }
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  sourceCanvas.getContext("2d").putImageData(image, 0, 0);
  const rotated = rotateCanvas(sourceCanvas, degrees, smooth);
  const data = rotated.ctx.getImageData(0, 0, rotated.width, rotated.height).data;
  const alpha = new Uint8ClampedArray(rotated.width * rotated.height);
  for (let p = 0, i = 3; p < alpha.length; p += 1, i += 4) alpha[p] = data[i];
  return { alpha, width: rotated.width, height: rotated.height };
}

function rotateCanvas(sourceCanvas, degrees, smooth) {
  const radians = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const width = Math.ceil(sourceCanvas.width * cos + sourceCanvas.height * sin);
  const height = Math.ceil(sourceCanvas.width * sin + sourceCanvas.height * cos);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = smooth;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { canvas, ctx, width: canvas.width, height: canvas.height };
}

function normalizeAngle(angle) {
  let normalized = Math.round(angle) % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return normalized;
}

function applyCurrentPolygon() {
  if (currentTool === "polyFg") applyPolygon("fg");
  if (currentTool === "polyBg") applyPolygon("bg");
}

function undoPolygonPoint() {
  if (!polygonPoints.length) return false;
  polygonPoints.pop();
  renderInteraction();
  return true;
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isCanvasControlTarget(target) {
  return Boolean(target.closest?.("button, select, input, .view-switch, .canvas-actions, .canvas-zoom, .canvas-rotate"));
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.info("Service worker registration skipped.", error);
  });
}

async function exportPng() {
  if (!state) return;
  const blob = await createOutputBlob(exportBackground.value);
  downloadBlob(blob, cleanFileName(state.fileName));
  const saved = await saveBlobToHistory(blob, {
    action: "PNG保存",
    background: exportBackground.value
  });
  showToast(saved ? "PNGを保存し、履歴に追加しました。" : "PNGを保存しました。");
}

async function copyTransparentPng() {
  if (!state) return;
  if (!navigator.clipboard || !window.ClipboardItem) {
    showToast("このブラウザは画像コピーに対応していません。");
    return;
  }
  try {
    const blob = await createOutputBlob("transparent");
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob })
    ]);
    const saved = await saveBlobToHistory(blob, {
      action: "コピー",
      background: "transparent"
    });
    showToast(saved ? "コピーし、履歴に追加しました。" : "クリップボードへコピーしました。");
  } catch (error) {
    console.error(error);
    showToast("コピーに失敗しました。");
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cleanFileName(fileName) {
  return fileName.replace(/\.[^.]+$/, "_client_clean.png");
}

function openHistoryDb() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("このブラウザは履歴保存に対応していません。"));
  if (historyDbPromise) return historyDbPromise;
  historyDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const store = db.createObjectStore(HISTORY_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return historyDbPromise;
}

async function historyTx(mode, callback) {
  const db = await openHistoryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, mode);
    const store = tx.objectStore(HISTORY_STORE);
    const result = callback(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getHistoryItems() {
  try {
    const items = await historyTx("readonly", (store) => requestResult(store.getAll()));
    return items.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error(error);
    return [];
  }
}

async function getHistoryItem(id) {
  return historyTx("readonly", (store) => requestResult(store.get(id)));
}

async function saveBlobToHistory(blob, details) {
  if (!state) return false;
  if (!historyEnabled.checked) return false;
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fileName: cleanFileName(state.fileName),
    sourceName: state.fileName,
    createdAt: Date.now(),
    size: blob.size,
    outputSize: outputSize.value,
    action: details.action,
    background: details.background,
    blob
  };
  try {
    await historyTx("readwrite", (store) => store.put(item));
    await trimHistory();
    await renderHistory();
    return true;
  } catch (error) {
    console.error(error);
    showToast("履歴保存に失敗しました。");
    return false;
  }
}

async function trimHistory() {
  const items = await getHistoryItems();
  const expired = items.slice(MAX_SAVED_HISTORY);
  if (!expired.length) return;
  await historyTx("readwrite", (store) => {
    expired.forEach((item) => store.delete(item.id));
  });
}

async function deleteHistoryItem(id) {
  await historyTx("readwrite", (store) => store.delete(id));
  await renderHistory();
  showToast("履歴を削除しました。");
}

async function clearHistory() {
  await historyTx("readwrite", (store) => store.clear());
  await renderHistory();
  showToast("履歴をすべて削除しました。");
}

async function copyHistoryItem(id) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    showToast("このブラウザは画像コピーに対応していません。");
    return;
  }
  const item = await getHistoryItem(id);
  if (!item) return;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": item.blob })]);
  showToast("履歴からコピーしました。");
}

async function saveHistoryItem(id) {
  const item = await getHistoryItem(id);
  if (!item) return;
  downloadBlob(item.blob, item.fileName);
  showToast("履歴からPNGを保存しました。");
}

async function renderHistory() {
  const items = await getHistoryItems();
  revokeHistoryPreviewUrls();
  historyList.replaceChildren();
  historyEmpty.hidden = items.length > 0;
  clearHistoryButton.disabled = items.length === 0;
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "history-item";
    row.dataset.id = item.id;

    const preview = document.createElement("div");
    preview.className = "history-thumb checker";
    const image = document.createElement("img");
    const url = URL.createObjectURL(item.blob);
    historyPreviewUrls.push(url);
    image.src = url;
    image.alt = item.sourceName || item.fileName;
    preview.append(image);

    const title = document.createElement("strong");
    title.textContent = item.sourceName || item.fileName;

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = `${formatDate(item.createdAt)} / ${item.action || "保存"} / ${backgroundLabel(item.background)} / ${formatBytes(item.size)} / ${item.outputSize || "標準"}`;

    const actions = document.createElement("div");
    actions.className = "history-actions";
    actions.innerHTML = `
      <button type="button" data-history-action="copy">コピー</button>
      <button type="button" data-history-action="save">保存</button>
      <button type="button" data-history-action="delete">削除</button>
    `;

    row.append(preview, title, meta, actions);
    historyList.append(row);
  }
}

function revokeHistoryPreviewUrls() {
  historyPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  historyPreviewUrls = [];
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function backgroundLabel(value) {
  const labels = {
    transparent: "透明",
    white: "白背景",
    black: "黒背景",
    gray: "検査グレー"
  };
  return labels[value] || "透明";
}

async function initializeHistory() {
  historyEnabled.checked = true;
  localStorage.setItem(HISTORY_ENABLED_KEY, "1");
  if (!("indexedDB" in window)) {
    historyEnabled.disabled = true;
    clearHistoryButton.disabled = true;
    historyEmpty.textContent = "このブラウザは履歴保存に対応していません。";
    return;
  }
  await renderHistory();
}

async function createOutputBlob(bg) {
  const bounds = alphaBounds(OUTPUT_PADDING);
  const sourceWidth = bounds.x2 - bounds.x1 + 1;
  const sourceHeight = bounds.y2 - bounds.y1 + 1;
  const scale = outputScale(sourceWidth, sourceHeight);
  const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
  tempCanvas.width = outputWidth;
  tempCanvas.height = outputHeight;
  tempCtx.clearRect(0, 0, outputWidth, outputHeight);
  tempCtx.imageSmoothingEnabled = true;
  tempCtx.imageSmoothingQuality = "high";
  if (bg !== "transparent") {
    tempCtx.fillStyle = bg === "black" ? "#111827" : bg === "gray" ? "#8f99a8" : "#ffffff";
    tempCtx.fillRect(0, 0, outputWidth, outputHeight);
  }
  const previousMode = previewMode;
  previewMode = "checker";
  renderOutput();
  tempCtx.drawImage(
    outputCanvas,
    bounds.x1,
    bounds.y1,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );
  previewMode = previousMode;
  renderOutput();
  return canvasToBlob(tempCanvas, "image/png");
}

function outputScale(width, height) {
  const preset = outputSize.value;
  const maxLongSide = preset === "light" ? 600 : preset === "standard" ? 900 : Infinity;
  if (!Number.isFinite(maxLongSide)) return 1;
  return Math.min(1, maxLongSide / Math.max(width, height));
}

function alphaBounds(padding = 0) {
  let x1 = state.width;
  let y1 = state.height;
  let x2 = -1;
  let y2 = -1;
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const alpha = state.alphaMask[y * state.width + x];
      if (alpha < 8) continue;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
    }
  }
  if (x2 < x1 || y2 < y1) {
    return { x1: 0, y1: 0, x2: state.width - 1, y2: state.height - 1 };
  }
  return {
    x1: clamp(x1 - padding, 0, state.width - 1),
    y1: clamp(y1 - padding, 0, state.height - 1),
    x2: clamp(x2 + padding, 0, state.width - 1),
    y2: clamp(y2 + padding, 0, state.height - 1)
  };
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

viewport.addEventListener("pointermove", (event) => {
  if (!state) return;
  if (isCanvasControlTarget(event.target) && !dragging) return;
  const point = canvasPoint(event);
  if (dragging && (currentTool === "pan" || rightButtonPanning)) {
    panX += event.clientX - lastPointer.x;
    panY += event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    applyTransform();
    return;
  }
  if (currentTool === "polyFg" || currentTool === "polyBg") {
    renderInteraction();
    if (polygonPoints.length) {
      interactionCtx.save();
      interactionCtx.strokeStyle = "rgba(37, 99, 235, 0.55)";
      interactionCtx.lineWidth = 1 / zoom;
      const last = polygonPoints[polygonPoints.length - 1];
      interactionCtx.beginPath();
      interactionCtx.moveTo(last.x, last.y);
      interactionCtx.lineTo(point.x, point.y);
      interactionCtx.stroke();
      interactionCtx.restore();
    }
    return;
  }
  if (currentTool === "toggle" && point.inside) {
    const label = state.labelMap[point.y * state.width + point.x];
    highlightLabel(label);
    const info = state.labels[label];
    labelInfo.textContent = info ? `島: ${label} / ${info.kind === "fg" ? "前景" : "背景"} / ${info.count}px` : "島: -";
  }
});

viewport.addEventListener("pointerdown", (event) => {
  if (!state) return;
  if (isCanvasControlTarget(event.target)) return;
  viewport.setPointerCapture(event.pointerId);
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
  if (currentTool === "toggle" && point.inside) {
    toggleLabel(state.labelMap[point.y * state.width + point.x]);
    dragging = false;
    return;
  }
});

viewport.addEventListener("pointerup", () => {
  if (!state) return;
  dragging = false;
  rightButtonPanning = false;
  updateCanvasCursor();
});

viewport.addEventListener("dblclick", (event) => {
  if (isCanvasControlTarget(event.target)) return;
  if (currentTool === "polyFg") applyPolygon("fg");
  if (currentTool === "polyBg") applyPolygon("bg");
});

viewport.addEventListener("pointercancel", () => {
  dragging = false;
  rightButtonPanning = false;
  updateCanvasCursor();
});

viewport.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

showBoundary.addEventListener("change", renderBoundary);
undoButton.addEventListener("click", undoMaskEdit);
redoButton.addEventListener("click", redoMaskEdit);
relabelButton.addEventListener("click", () => {
  relabel();
  renderAll();
  showToast("島を再計算しました。");
});
applyPolygonButton.addEventListener("click", applyCurrentPolygon);
undoPointButton.addEventListener("click", undoPolygonPoint);
clearPolygonButton.addEventListener("click", clearPolygon);
zoomOutButton.addEventListener("click", () => zoomAtCenter(zoom / 1.25));
zoomInButton.addEventListener("click", () => zoomAtCenter(zoom * 1.25));
zoomResetButton.addEventListener("click", resetView);
rotateButtons.forEach((button) => {
  button.addEventListener("click", () => rotateCurrentImage(Number(button.dataset.rotate)));
});
copyButton.addEventListener("click", copyTransparentPng);
saveButton.addEventListener("click", exportPng);
historyEnabled.addEventListener("change", () => {
  localStorage.setItem(HISTORY_ENABLED_KEY, historyEnabled.checked ? "1" : "0");
  showToast(historyEnabled.checked ? "履歴保存をONにしました。" : "履歴保存をOFFにしました。");
});
historyList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-history-action]");
  if (!button) return;
  const item = button.closest(".history-item");
  if (!item) return;
  const action = button.dataset.historyAction;
  if (action === "copy") await copyHistoryItem(item.dataset.id);
  if (action === "save") await saveHistoryItem(item.dataset.id);
  if (action === "delete") await deleteHistoryItem(item.dataset.id);
});
clearHistoryButton.addEventListener("click", clearHistory);
window.addEventListener("resize", () => {
  if (!state) return;
  resetView();
});
window.addEventListener("pagehide", revokeHistoryPreviewUrls);

document.addEventListener("keydown", (event) => {
  if (isTypingTarget(event.target)) return;

  if (event.key === "Escape") {
    event.preventDefault();
    setTool("pan");
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if ((currentTool === "polyFg" || currentTool === "polyBg") && undoPolygonPoint()) return;
    undoMaskEdit();
    return;
  }

  if (event.key === "Enter" && (currentTool === "polyFg" || currentTool === "polyBg")) {
    event.preventDefault();
    applyCurrentPolygon();
    return;
  }

  if (event.key === "Delete" && (currentTool === "polyFg" || currentTool === "polyBg")) {
    event.preventDefault();
    clearPolygon();
  }
});

registerServiceWorker();
initializeHistory();
