import {
  AUDIO_ANALYSIS_INTERVAL_MS,
  BODY_DETECT_INTERVAL_MS,
  BODY_HOLD_MS,
  EYE_LANDMARK_INDICES,
  FACE_DETECT_INTERVAL_MS,
  FACE_HOLD_MS,
  FACE_MODEL_URL,
  FACE_REGIONS,
  FEATURE_SAMPLE_INTERVAL_MS,
  HAND_DETECT_INTERVAL_MS,
  HAND_HOLD_MS,
  HAND_MODEL_URL,
  LABELS_STORAGE_KEY,
  MAX_LABEL_EVENTS,
  MEDIAPIPE_VERSION,
  POSE_LANDMARK_NAMES,
  POSE_MODEL_URL,
  SETTINGS_VERSION,
  STORAGE_KEY
} from "./src/config.js";
import { CHILD_EMOTIONS, CHILD_NEED_EMOJIS, NEED_LABELS } from "./src/vocabulary.js";
import { affectSnapshot, needHypotheses, timeContextSnapshot } from "./src/interpretation.js";
import { telemetryQueryGraphql, telemetrySchemaGraphql } from "./src/graphql-contract.js";
import {
  averageFeature,
  averageNumber,
  averagePoint,
  boundingBox,
  clamp01,
  clampInt,
  debounce,
  distance,
  formatJson,
  inferStep,
  labelFor,
  localIsoString,
  numberOrNull,
  radiansToDegrees,
  ratioDistance,
  shortId,
  titleCase
} from "./src/math.js";

const els = {
  video: document.querySelector("#video"),
  canvas: document.querySelector("#canvas"),
  viewer: document.querySelector(".viewer"),
  childOverlay: document.querySelector("#childOverlay"),
  childEmotionCards: document.querySelector("#childEmotionCards"),
  childNeedCards: document.querySelector("#childNeedCards"),
  status: document.querySelector("#status"),
  faceLoadBadge: document.querySelector("#faceLoadBadge"),
  faceLoadText: document.querySelector("#faceLoadText"),
  handLoadBadge: document.querySelector("#handLoadBadge"),
  handLoadText: document.querySelector("#handLoadText"),
  bodyLoadBadge: document.querySelector("#bodyLoadBadge"),
  bodyLoadText: document.querySelector("#bodyLoadText"),
  audioLoadBadge: document.querySelector("#audioLoadBadge"),
  audioLoadText: document.querySelector("#audioLoadText"),
  deviceSelect: document.querySelector("#deviceSelect"),
  widthInput: document.querySelector("#widthInput"),
  heightInput: document.querySelector("#heightInput"),
  fpsInput: document.querySelector("#fpsInput"),
  renderFpsInput: document.querySelector("#renderFpsInput"),
  rotationSelect: document.querySelector("#rotationSelect"),
  aspectSelect: document.querySelector("#aspectSelect"),
  fitSelect: document.querySelector("#fitSelect"),
  controlSummary: document.querySelector("#controlSummary"),
  settingsSummary: document.querySelector("#settingsSummary"),
  streamSummary: document.querySelector("#streamSummary"),
  faceSummary: document.querySelector("#faceSummary"),
  sessionSummary: document.querySelector("#sessionSummary"),
  reviewSummary: document.querySelector("#reviewSummary"),
  capabilitiesSummary: document.querySelector("#capabilitiesSummary"),
  startButton: document.querySelector("#startButton"),
  stopButton: document.querySelector("#stopButton"),
  snapshotButton: document.querySelector("#snapshotButton"),
  recordButton: document.querySelector("#recordButton"),
  scanButton: document.querySelector("#scanButton"),
  mirrorToggle: document.querySelector("#mirrorToggle"),
  overlayToggle: document.querySelector("#overlayToggle"),
  metricsToggle: document.querySelector("#metricsToggle"),
  denseFaceToggle: document.querySelector("#denseFaceToggle"),
  eyeScanToggle: document.querySelector("#eyeScanToggle"),
  handTelemetryToggle: document.querySelector("#handTelemetryToggle"),
  bodyTelemetryToggle: document.querySelector("#bodyTelemetryToggle"),
  audioTelemetryToggle: document.querySelector("#audioTelemetryToggle"),
  fingerprintToggle: document.querySelector("#fingerprintToggle"),
  autoStartToggle: document.querySelector("#autoStartToggle"),
  childModeToggle: document.querySelector("#childModeToggle"),
  bufferSecondsInput: document.querySelector("#bufferSecondsInput"),
  childSummarySecondsInput: document.querySelector("#childSummarySecondsInput"),
  exportLabelsButton: document.querySelector("#exportLabelsButton"),
  clearLabelsButton: document.querySelector("#clearLabelsButton"),
  dynamicControls: document.querySelector("#dynamicControls"),
  streamReadout: document.querySelector("#streamReadout"),
  sessionReadout: document.querySelector("#sessionReadout"),
  reviewCards: document.querySelector("#reviewCards"),
  faceReadout: document.querySelector("#faceReadout"),
  queryReadout: document.querySelector("#queryReadout"),
  schemaReadout: document.querySelector("#schemaReadout"),
  capabilitiesReadout: document.querySelector("#capabilitiesReadout")
};

const ctx = els.canvas.getContext("2d", { alpha: false });
const appMode = new URLSearchParams(window.location.search).get("mode") === "child" ? "child" : "dev";
const CHILD_AFFECT_BY_ALIAS = new Map(
  CHILD_EMOTIONS.flatMap((emotion) => emotion.aliases.map((alias) => [alias, emotion]))
);
const CHILD_AFFECT_BY_KEY = new Map(CHILD_EMOTIONS.map((emotion) => [emotion.key, emotion]));
const CHILD_SUMMARY_LIMIT = 3;
const state = {
  stream: null,
  track: null,
  devices: [],
  capabilities: {},
  settings: {},
  faceLandmarker: null,
  faceReady: false,
  faceLoading: false,
  faceError: null,
  faceDelegate: null,
  latestFace: null,
  lastValidFace: null,
  lastValidFaceAt: 0,
  handLandmarker: null,
  handReady: false,
  handLoading: false,
  handError: null,
  handDelegate: null,
  latestHands: null,
  lastValidHands: null,
  lastValidHandsAt: 0,
  poseLandmarker: null,
  bodyReady: false,
  bodyLoading: false,
  bodyError: null,
  bodyDelegate: null,
  latestBody: null,
  lastValidBody: null,
  lastValidBodyAt: 0,
  audioStream: null,
  audioContext: null,
  audioSource: null,
  audioAnalyser: null,
  audioTimeData: null,
  audioFreqData: null,
  audioReady: false,
  audioLoading: false,
  audioError: null,
  latestAudio: null,
  lastAudioAt: 0,
  featureBuffer: [],
  labels: [],
  lastFeatureSampleAt: 0,
  latestRolling: null,
  latestQuality: null,
  frameCount: 0,
  fps: 0,
  lastFpsAt: performance.now(),
  lastRenderAt: 0,
  lastReadoutAt: 0,
  lastDetectAt: 0,
  lastHandDetectAt: 0,
  lastBodyDetectAt: 0,
  lastQualityAt: 0,
  recorder: null,
  recordedChunks: [],
  isRecording: false,
  renderLayout: null,
  oneTimeScan: {
    status: "idle",
    storedHash: null,
    reason: "Biometric hash storage disabled; use passkey/WebAuthn binding."
  }
};

boot();

async function boot() {
  bindEvents();
  restoreSettings();
  applyAppMode();
  restoreLabels();
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  setStatus("Ready");
  await listDevices();
  renderLoop();
  updateButtons();
  updateReadouts();
  els.queryReadout.textContent = telemetryQueryGraphql();
  els.schemaReadout.textContent = telemetrySchemaGraphql();
  if (els.autoStartToggle.checked) {
    await startCamera();
  }
}

function applyAppMode() {
  document.body.classList.toggle("child-runtime", appMode === "child");
  if (appMode !== "child") return;
  els.childModeToggle.checked = true;
  els.metricsToggle.checked = true;
  els.autoStartToggle.checked = true;
}

function bindEvents() {
  els.startButton.addEventListener("click", startCamera);
  els.stopButton.addEventListener("click", stopCamera);
  els.snapshotButton.addEventListener("click", takeSnapshot);
  els.recordButton.addEventListener("click", toggleRecording);
  els.scanButton.addEventListener("click", runOneTimeScan);
  els.exportLabelsButton.addEventListener("click", exportLabelEvents);
  els.clearLabelsButton.addEventListener("click", clearLabelEvents);
  els.deviceSelect.addEventListener("change", () => {
    saveSettings();
    if (state.stream) startCamera();
  });
  for (const input of [els.widthInput, els.heightInput, els.fpsInput]) {
    input.addEventListener("change", () => {
      saveSettings();
      if (state.stream) startCamera();
    });
  }
  els.renderFpsInput.addEventListener("change", () => {
    saveSettings();
    updateReadouts();
  });
  els.bufferSecondsInput.addEventListener("change", () => {
    saveSettings();
    trimFeatureBuffer(performance.now());
    updateReadouts();
  });
  els.childSummarySecondsInput.addEventListener("change", () => {
    saveSettings();
    updateReadouts();
  });
  els.metricsToggle.addEventListener("change", async () => {
    saveSettings();
    if (els.metricsToggle.checked && state.stream) await ensureFaceLandmarker();
    updateReadouts();
  });
  els.handTelemetryToggle.addEventListener("change", async () => {
    saveSettings();
    if (els.handTelemetryToggle.checked && state.stream) await ensureHandLandmarker();
    updateReadouts();
  });
  els.bodyTelemetryToggle.addEventListener("change", async () => {
    saveSettings();
    if (els.bodyTelemetryToggle.checked && state.stream) await ensurePoseLandmarker();
    updateReadouts();
  });
  els.audioTelemetryToggle.addEventListener("change", async () => {
    saveSettings();
    if (els.audioTelemetryToggle.checked && state.stream) {
      await ensureAudioTelemetry();
    } else {
      stopAudioTelemetry();
    }
    updateReadouts();
  });
  els.eyeScanToggle.addEventListener("change", async () => {
    if (els.eyeScanToggle.checked) els.metricsToggle.checked = true;
    saveSettings();
    if (els.metricsToggle.checked && state.stream) await ensureFaceLandmarker();
    updateReadouts();
  });
  for (const input of [els.denseFaceToggle, els.fingerprintToggle]) {
    input.addEventListener("change", () => {
      saveSettings();
      updateReadouts();
    });
  }

  els.childModeToggle.addEventListener("change", async () => {
    if (els.childModeToggle.checked) {
      els.metricsToggle.checked = true;
      if (state.stream) await ensureFaceLandmarker();
    }
    saveSettings();
    updateChildMode();
    updateReadouts();
  });

  for (const button of document.querySelectorAll("[data-label-kind][data-label]")) {
    button.addEventListener("click", () => addLabelEvent(button.dataset.labelKind, button.dataset.label));
  }

  for (const input of [
    els.mirrorToggle,
    els.overlayToggle,
    els.autoStartToggle,
    els.rotationSelect,
    els.aspectSelect,
    els.fitSelect
  ]) {
    input.addEventListener("change", () => {
      saveSettings();
      updateReadouts();
    });
  }

  for (const details of document.querySelectorAll("[data-persist-open]")) {
    details.addEventListener("toggle", saveSettings);
  }
}

async function listDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    setStatus("Media devices API is not available.");
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  state.devices = devices.filter((device) => device.kind === "videoinput");
  els.deviceSelect.innerHTML = "";

  for (const [index, device] of state.devices.entries()) {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `Camera ${index + 1}`;
    els.deviceSelect.append(option);
  }

  if (state.devices.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Default camera";
    els.deviceSelect.append(option);
  }

  const saved = readSettings();
  if (saved.deviceId && [...els.deviceSelect.options].some((option) => option.value === saved.deviceId)) {
    els.deviceSelect.value = saved.deviceId;
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("getUserMedia is not available in this browser.");
    return;
  }

  stopCamera({ silent: true });
  setStatus("Requesting camera...");

  const width = clampInt(els.widthInput.value, 160, 7680, 1280);
  const height = clampInt(els.heightInput.value, 120, 4320, 720);
  const frameRate = clampInt(els.fpsInput.value, 1, 240, 30);
  const deviceId = els.deviceSelect.value;

  const video = {
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: frameRate },
    resizeMode: "crop-and-scale"
  };
  if (deviceId) video.deviceId = { exact: deviceId };

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    els.video.srcObject = state.stream;
    await els.video.play();

    state.track = state.stream.getVideoTracks()[0] || null;
    refreshTrackInfo();
    buildDynamicControls();
    await listDevices();
    await ensureFaceLandmarker();
    await ensureHandLandmarker();
    await ensurePoseLandmarker();
    await ensureAudioTelemetry();

    setStatus(streamingStatusText());
  } catch (error) {
    stopCamera({ silent: true });
    setStatus(cameraErrorMessage(error));
  } finally {
    updateButtons();
    updateReadouts();
  }
}

function stopCamera({ silent = false } = {}) {
  if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
  stopAudioTelemetry({ clearError: true });
  if (state.stream) {
    for (const track of state.stream.getTracks()) track.stop();
  }
  state.stream = null;
  state.track = null;
  state.capabilities = {};
  state.settings = {};
  state.latestFace = null;
  state.lastValidFace = null;
  state.lastValidFaceAt = 0;
  state.latestHands = null;
  state.lastValidHands = null;
  state.lastValidHandsAt = 0;
  state.latestBody = null;
  state.lastValidBody = null;
  state.lastValidBodyAt = 0;
  state.latestQuality = null;
  state.faceError = null;
  state.handError = null;
  state.bodyError = null;
  state.audioError = null;
  els.video.srcObject = null;
  els.dynamicControls.innerHTML = "";
  if (!silent) setStatus("Stopped");
  updateButtons();
  updateFaceLoader();
  updateHandLoader();
  updateBodyLoader();
  updateAudioLoader();
  updateReadouts();
}

function refreshTrackInfo() {
  if (!state.track) return;
  state.capabilities = typeof state.track.getCapabilities === "function" ? state.track.getCapabilities() : {};
  state.settings = typeof state.track.getSettings === "function" ? state.track.getSettings() : {};
}

function buildDynamicControls() {
  els.dynamicControls.innerHTML = "";
  if (!state.track) return;

  const numericKeys = [
    "zoom",
    "focusDistance",
    "exposureCompensation",
    "brightness",
    "contrast",
    "saturation",
    "sharpness",
    "colorTemperature"
  ];
  for (const key of numericKeys) {
    const cap = state.capabilities[key];
    if (!cap || typeof cap.min !== "number" || typeof cap.max !== "number") continue;
    els.dynamicControls.append(createRangeControl(key, cap, state.settings[key] ?? cap.min));
  }

  const enumKeys = ["focusMode", "exposureMode", "whiteBalanceMode"];
  for (const key of enumKeys) {
    const values = state.capabilities[key];
    if (!Array.isArray(values) || values.length === 0) continue;
    els.dynamicControls.append(createSelectControl(key, values, state.settings[key]));
  }

  if (state.capabilities.torch) {
    els.dynamicControls.append(createBooleanControl("torch", Boolean(state.settings.torch)));
  }
}

function createRangeControl(key, cap, value) {
  const row = document.createElement("label");
  row.textContent = labelFor(key);

  const wrap = document.createElement("div");
  wrap.className = "range-row";

  const range = document.createElement("input");
  range.type = "range";
  range.min = cap.min;
  range.max = cap.max;
  range.step = cap.step || inferStep(cap.min, cap.max);
  range.value = value;

  const number = document.createElement("input");
  number.type = "number";
  number.min = cap.min;
  number.max = cap.max;
  number.step = range.step;
  number.value = value;

  const apply = debounce(async (nextValue) => {
    range.value = nextValue;
    number.value = nextValue;
    await applyAdvancedConstraint(key, Number(nextValue));
  }, 80);

  range.addEventListener("input", () => apply(range.value));
  number.addEventListener("change", () => apply(number.value));

  wrap.append(range, number);
  row.append(wrap);
  return row;
}

function createSelectControl(key, values, value) {
  const label = document.createElement("label");
  label.textContent = labelFor(key);
  const select = document.createElement("select");
  for (const item of values) {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    select.append(option);
  }
  if (value) select.value = value;
  select.addEventListener("change", () => applyAdvancedConstraint(key, select.value));
  label.append(select);
  return label;
}

function createBooleanControl(key, value) {
  const label = document.createElement("label");
  label.textContent = labelFor(key);
  const select = document.createElement("select");
  for (const item of [false, true]) {
    const option = document.createElement("option");
    option.value = String(item);
    option.textContent = item ? "on" : "off";
    select.append(option);
  }
  select.value = String(value);
  select.addEventListener("change", () => applyAdvancedConstraint(key, select.value === "true"));
  label.append(select);
  return label;
}

async function applyAdvancedConstraint(key, value) {
  if (!state.track?.applyConstraints) return;
  try {
    await state.track.applyConstraints({ advanced: [{ [key]: value }] });
    refreshTrackInfo();
    updateReadouts();
    setStatus(`Applied ${labelFor(key)}`);
  } catch (error) {
    setStatus(`Could not apply ${labelFor(key)}: ${error.name || "error"}`);
  }
}

async function ensureFaceLandmarker() {
  if (!els.metricsToggle.checked || state.faceReady || state.faceLoading) return;
  state.faceLoading = true;
  state.faceError = null;
  state.faceDelegate = null;
  setStatus("Loading face telemetry model...");
  updateFaceLoader();

  try {
    const { FaceLandmarker, FilesetResolver } = await import(mediaPipeBundleUrl());
    const vision = await FilesetResolver.forVisionTasks(mediaPipeWasmUrl());
    const loaded = await createFaceLandmarker(FaceLandmarker, vision);
    state.faceLandmarker = loaded.landmarker;
    state.faceDelegate = loaded.delegate;
    state.faceReady = true;
    state.faceError = null;
    setStatus(`Face telemetry ready (${state.faceDelegate})`);
  } catch (error) {
    state.faceReady = false;
    state.faceError = errorMessage(error);
    setStatus(`Face telemetry unavailable: ${state.faceError}`);
  } finally {
    state.faceLoading = false;
    updateFaceLoader();
    updateReadouts();
  }
}

async function createFaceLandmarker(FaceLandmarker, vision) {
  try {
    return {
      landmarker: await FaceLandmarker.createFromOptions(vision, faceLandmarkerOptions("GPU")),
      delegate: "GPU"
    };
  } catch (gpuError) {
    return {
      landmarker: await FaceLandmarker.createFromOptions(vision, faceLandmarkerOptions("CPU")),
      delegate: "CPU",
      gpuError
    };
  }
}

function faceLandmarkerOptions(delegate) {
  return {
    baseOptions: {
      modelAssetPath: FACE_MODEL_URL,
      delegate
    },
    runningMode: "VIDEO",
    numFaces: 2,
    minFaceDetectionConfidence: 0.3,
    minFacePresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true
  };
}

async function ensureHandLandmarker() {
  if (!els.handTelemetryToggle.checked || state.handReady || state.handLoading) return;
  state.handLoading = true;
  state.handError = null;
  state.handDelegate = null;
  setStatus("Loading hand telemetry model...");
  updateHandLoader();

  try {
    const { HandLandmarker, FilesetResolver } = await import(mediaPipeBundleUrl());
    const vision = await FilesetResolver.forVisionTasks(mediaPipeWasmUrl());
    const loaded = await createHandLandmarker(HandLandmarker, vision);
    state.handLandmarker = loaded.landmarker;
    state.handDelegate = loaded.delegate;
    state.handReady = true;
    state.handError = null;
    setStatus(`Hand telemetry ready (${state.handDelegate})`);
  } catch (error) {
    state.handReady = false;
    state.handError = errorMessage(error);
    setStatus(`Hand telemetry unavailable: ${state.handError}`);
  } finally {
    state.handLoading = false;
    updateHandLoader();
    updateReadouts();
  }
}

async function createHandLandmarker(HandLandmarker, vision) {
  try {
    return {
      landmarker: await HandLandmarker.createFromOptions(vision, handLandmarkerOptions("GPU")),
      delegate: "GPU"
    };
  } catch (gpuError) {
    return {
      landmarker: await HandLandmarker.createFromOptions(vision, handLandmarkerOptions("CPU")),
      delegate: "CPU",
      gpuError
    };
  }
}

function handLandmarkerOptions(delegate) {
  return {
    baseOptions: {
      modelAssetPath: HAND_MODEL_URL,
      delegate
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  };
}

async function ensurePoseLandmarker() {
  if (!els.bodyTelemetryToggle.checked || state.bodyReady || state.bodyLoading) return;
  state.bodyLoading = true;
  state.bodyError = null;
  state.bodyDelegate = null;
  setStatus("Loading body telemetry model...");
  updateBodyLoader();

  try {
    const { PoseLandmarker, FilesetResolver } = await import(mediaPipeBundleUrl());
    const vision = await FilesetResolver.forVisionTasks(mediaPipeWasmUrl());
    const loaded = await createPoseLandmarker(PoseLandmarker, vision);
    state.poseLandmarker = loaded.landmarker;
    state.bodyDelegate = loaded.delegate;
    state.bodyReady = true;
    state.bodyError = null;
    setStatus(`Body telemetry ready (${state.bodyDelegate})`);
  } catch (error) {
    state.bodyReady = false;
    state.bodyError = errorMessage(error);
    setStatus(`Body telemetry unavailable: ${state.bodyError}`);
  } finally {
    state.bodyLoading = false;
    updateBodyLoader();
    updateReadouts();
  }
}

async function createPoseLandmarker(PoseLandmarker, vision) {
  try {
    return {
      landmarker: await PoseLandmarker.createFromOptions(vision, poseLandmarkerOptions("GPU")),
      delegate: "GPU"
    };
  } catch (gpuError) {
    return {
      landmarker: await PoseLandmarker.createFromOptions(vision, poseLandmarkerOptions("CPU")),
      delegate: "CPU",
      gpuError
    };
  }
}

function poseLandmarkerOptions(delegate) {
  return {
    baseOptions: {
      modelAssetPath: POSE_MODEL_URL,
      delegate
    },
    runningMode: "VIDEO",
    numPoses: 2,
    minPoseDetectionConfidence: 0.35,
    minPosePresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
    outputSegmentationMasks: false
  };
}

async function ensureAudioTelemetry() {
  if (!els.audioTelemetryToggle.checked || state.audioReady || state.audioLoading) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
    state.audioError = "Web Audio or microphone API is not available.";
    updateAudioLoader();
    return;
  }

  state.audioLoading = true;
  state.audioError = null;
  setStatus("Requesting microphone telemetry...");
  updateAudioLoader();

  try {
    state.audioStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    state.audioContext = new AudioContextClass();
    if (state.audioContext.state === "suspended") await state.audioContext.resume();
    state.audioAnalyser = state.audioContext.createAnalyser();
    state.audioAnalyser.fftSize = 2048;
    state.audioAnalyser.smoothingTimeConstant = 0.72;
    state.audioTimeData = new Float32Array(state.audioAnalyser.fftSize);
    state.audioFreqData = new Float32Array(state.audioAnalyser.frequencyBinCount);
    state.audioSource = state.audioContext.createMediaStreamSource(state.audioStream);
    state.audioSource.connect(state.audioAnalyser);
    state.audioReady = true;
    state.audioError = null;
    state.latestAudio = null;
    setStatus("Audio telemetry ready");
  } catch (error) {
    stopAudioTelemetry();
    state.audioError = audioErrorMessage(error);
    setStatus(`Audio telemetry unavailable: ${state.audioError}`);
  } finally {
    state.audioLoading = false;
    updateAudioLoader();
    updateReadouts();
  }
}

function stopAudioTelemetry({ clearError = false } = {}) {
  try {
    state.audioSource?.disconnect();
  } catch {
    // Audio nodes can already be disconnected.
  }
  if (state.audioStream) {
    for (const track of state.audioStream.getTracks()) track.stop();
  }
  if (state.audioContext && state.audioContext.state !== "closed") {
    state.audioContext.close().catch(() => {});
  }
  state.audioStream = null;
  state.audioContext = null;
  state.audioSource = null;
  state.audioAnalyser = null;
  state.audioTimeData = null;
  state.audioFreqData = null;
  state.audioReady = false;
  state.audioLoading = false;
  state.latestAudio = null;
  state.lastAudioAt = 0;
  if (clearError) state.audioError = null;
  updateAudioLoader();
}

function mediaPipeBundleUrl() {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
}

function mediaPipeWasmUrl() {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
}

function renderLoop(now = performance.now()) {
  requestAnimationFrame(renderLoop);
  if (!shouldRenderFrame(now)) {
    updateReadoutsThrottled(now);
    return;
  }

  resizeCanvas();
  drawFrame();
  updateFps(now);

  if (state.stream && els.metricsToggle.checked && now - state.lastDetectAt > FACE_DETECT_INTERVAL_MS) {
    state.lastDetectAt = now;
    detectFace(now);
  }
  if (state.stream && els.handTelemetryToggle.checked && now - state.lastHandDetectAt > HAND_DETECT_INTERVAL_MS) {
    state.lastHandDetectAt = now;
    detectHands(now);
  }
  if (state.stream && els.bodyTelemetryToggle.checked && now - state.lastBodyDetectAt > BODY_DETECT_INTERVAL_MS) {
    state.lastBodyDetectAt = now;
    detectBody(now);
  }
  if (els.audioTelemetryToggle.checked && state.audioReady && now - state.lastAudioAt > AUDIO_ANALYSIS_INTERVAL_MS) {
    state.lastAudioAt = now;
    state.latestAudio = measureAudioTelemetry(now);
  }
  if (state.stream && now - state.lastQualityAt > 500) {
    state.lastQualityAt = now;
    state.latestQuality = measureFrameQuality();
  }
  if (state.stream && now - state.lastFeatureSampleAt > FEATURE_SAMPLE_INTERVAL_MS) {
    state.lastFeatureSampleAt = now;
    captureFeatureSample(now);
  }
  if (state.stream && els.childModeToggle.checked) {
    drawCatMaskOverlay(state.latestFace);
  } else if (els.overlayToggle.checked && state.stream) {
    drawFaceOverlay(state.latestFace);
    drawHandOverlay(state.latestHands);
    drawBodyOverlay(state.latestBody);
  }
  updateReadoutsThrottled(now);
}

function drawFrame() {
  const { width, height } = els.canvas;
  ctx.fillStyle = "#020202";
  ctx.fillRect(0, 0, width, height);

  state.renderLayout = getRenderLayout(width, height);
  if (els.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

  ctx.save();
  clipRect(state.renderLayout.frameRect);
  drawVideoIntoRect(state.renderLayout.contentRect);
  ctx.restore();
}

function detectFace(now) {
  if (!state.faceLandmarker || els.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  try {
    const result = state.faceLandmarker.detectForVideo(els.canvas, now);
    const telemetry = extractFaceTelemetry(result, now);
    if (telemetry.count > 0) {
      state.latestFace = telemetry;
      state.lastValidFace = telemetry;
      state.lastValidFaceAt = now;
    } else {
      state.latestFace = staleFaceTelemetry(now) || telemetry;
    }
  } catch (error) {
    state.latestFace = staleFaceTelemetry(now, errorMessage(error)) || {
      error: errorMessage(error),
      count: null,
      faces: [],
      stale: false,
      lastSeenMsAgo: null
    };
  }
}

function extractFaceTelemetry(result, now) {
  const landmarks = result.faceLandmarks || [];
  const blendshapes = result.faceBlendshapes || [];
  const matrices = result.facialTransformationMatrixes || [];
  if (landmarks.length === 0) {
    return { count: 0, faces: [], stale: false, capturedAt: Math.round(now), lastSeenMsAgo: null, detectError: null };
  }

  const faces = landmarks.map((points, index) => {
    const box = boundingBox(points);
    const blend = topBlendshapes(blendshapes[index]);
    const blendScores = blendshapeScoreMap(blendshapes[index]);
    return {
      index,
      pointCount: points.length,
      box,
      center: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      eyeOpen: eyeOpenness(points),
      blink: isBlink(points),
      mouthOpen: mouthOpenness(points),
      pose: poseFromMatrix(matrices[index]),
      blend,
      blendScores,
      regions: faceRegions(points),
      eyeScan: eyeScan(points),
      points
    };
  });

  return { count: faces.length, faces, stale: false, capturedAt: Math.round(now), lastSeenMsAgo: 0, detectError: null };
}

function detectHands(now) {
  if (!state.handLandmarker || els.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  try {
    const result = state.handLandmarker.detectForVideo(els.canvas, now);
    const telemetry = extractHandTelemetry(result, now);
    if (telemetry.count > 0) {
      state.latestHands = telemetry;
      state.lastValidHands = telemetry;
      state.lastValidHandsAt = now;
    } else {
      state.latestHands = staleHandTelemetry(now) || telemetry;
    }
  } catch (error) {
    state.latestHands = staleHandTelemetry(now, errorMessage(error)) || {
      error: errorMessage(error),
      count: null,
      hands: [],
      stale: false,
      lastSeenMsAgo: null
    };
  }
}

function extractHandTelemetry(result, now) {
  const landmarks = result.landmarks || result.handLandmarks || [];
  const handednesses = result.handednesses || result.handedness || [];
  if (landmarks.length === 0) {
    return { count: 0, hands: [], stale: false, capturedAt: Math.round(now), lastSeenMsAgo: null, detectError: null };
  }

  const hands = landmarks.map((points, index) => {
    const label = handednesses[index]?.[0]?.categoryName || handednesses[index]?.[0]?.displayName || handednesses[index]?.categoryName || null;
    const score = handednesses[index]?.[0]?.score ?? handednesses[index]?.score ?? null;
    return {
      index,
      label,
      score,
      pointCount: points.length,
      box: boundingBox(points),
      wrist: points[0],
      thumbTip: points[4],
      indexTip: points[8],
      middleTip: points[12],
      ringTip: points[16],
      pinkyTip: points[20],
      openness: handOpenness(points),
      pinch: handPinch(points),
      points
    };
  });

  return { count: hands.length, hands, stale: false, capturedAt: Math.round(now), lastSeenMsAgo: 0, detectError: null };
}

function detectBody(now) {
  if (!state.poseLandmarker || els.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  try {
    const result = state.poseLandmarker.detectForVideo(els.canvas, now);
    const telemetry = extractBodyTelemetry(result, now);
    if (telemetry.count > 0) {
      state.latestBody = telemetry;
      state.lastValidBody = telemetry;
      state.lastValidBodyAt = now;
    } else {
      state.latestBody = staleBodyTelemetry(now) || telemetry;
    }
  } catch (error) {
    state.latestBody = staleBodyTelemetry(now, errorMessage(error)) || {
      error: errorMessage(error),
      count: null,
      poses: [],
      stale: false,
      lastSeenMsAgo: null
    };
  }
}

function extractBodyTelemetry(result, now) {
  const landmarks = result.landmarks || result.poseLandmarks || [];
  const worldLandmarks = result.worldLandmarks || result.poseWorldLandmarks || [];
  if (landmarks.length === 0) {
    return { count: 0, poses: [], stale: false, capturedAt: Math.round(now), lastSeenMsAgo: null, detectError: null };
  }

  const poses = landmarks.map((points, index) => ({
    index,
    pointCount: points.length,
    box: boundingBox(points),
    center: averagePoint(points),
    keypoints: points.map((point, pointIndex) => ({
      name: POSE_LANDMARK_NAMES[pointIndex] || `point${pointIndex}`,
      point,
      world: worldLandmarks[index]?.[pointIndex] || null,
      visibility: point.visibility ?? null,
      presence: point.presence ?? null
    }))
  }));

  return { count: poses.length, poses, stale: false, capturedAt: Math.round(now), lastSeenMsAgo: 0, detectError: null };
}

function drawFaceOverlay(faceTelemetry) {
  if (!faceTelemetry?.faces?.length) return;
  const { width, height } = els.canvas;
  ctx.save();

  for (const face of faceTelemetry.faces || []) {
    drawFacePoints(face.points, width, height, faceTelemetry.stale);
  }
  ctx.restore();
}

function drawCatMaskOverlay(faceTelemetry) {
  if (!faceTelemetry?.faces?.length) return;
  const { width, height } = els.canvas;
  ctx.save();
  for (const face of faceTelemetry.faces || []) {
    drawCatMask(face, width, height, faceTelemetry.stale);
  }
  ctx.restore();
}

function drawCatMask(face, width, height, stale) {
  const box = face.box;
  const points = face.points || [];
  if (!box || points.length === 0) return;

  const scale = canvasScale();
  const x = box.x * width;
  const y = box.y * height;
  const w = box.width * width;
  const h = box.height * height;
  const alpha = stale ? 0.42 : 0.86;
  const nose = toCanvasPoint(points[1] || points[4] || face.center, width, height);
  const leftCheek = toCanvasPoint(points[205] || points[50] || { x: box.x, y: box.y + box.height * 0.62 }, width, height);
  const rightCheek = toCanvasPoint(points[425] || points[280] || { x: box.x + box.width, y: box.y + box.height * 0.62 }, width, height);
  const leftEar = {
    x: x + w * 0.25,
    y: y - h * 0.22,
    size: Math.max(28 * scale, w * 0.24)
  };
  const rightEar = {
    x: x + w * 0.75,
    y: y - h * 0.22,
    size: Math.max(28 * scale, w * 0.24)
  };

  ctx.save();
  ctx.globalAlpha = alpha;
  drawCatEar(leftEar.x, leftEar.y, leftEar.size, -0.18, "#8b949e", "#f0a7b4");
  drawCatEar(rightEar.x, rightEar.y, rightEar.size, 0.18, "#8b949e", "#f0a7b4");
  drawFurHalo(x, y, w, h, scale);
  drawCatNose(nose, Math.max(7 * scale, w * 0.035));
  drawWhiskers(leftCheek, rightCheek, w, scale);
  if (face.mouthOpen > 0.32) drawTinyCatMouth(nose, w, scale);
  ctx.restore();
}

function drawCatEar(cx, cy, size, tilt, fill, innerFill) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.62);
  ctx.quadraticCurveTo(-size * 0.58, size * 0.18, -size * 0.2, size * 0.58);
  ctx.quadraticCurveTo(0, size * 0.42, size * 0.2, size * 0.58);
  ctx.quadraticCurveTo(size * 0.58, size * 0.18, 0, -size * 0.62);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.055);
  ctx.strokeStyle = "rgba(244,244,240,0.82)";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -size * 0.28);
  ctx.quadraticCurveTo(-size * 0.26, size * 0.18, 0, size * 0.28);
  ctx.quadraticCurveTo(size * 0.26, size * 0.18, 0, -size * 0.28);
  ctx.closePath();
  ctx.fillStyle = innerFill;
  ctx.globalAlpha *= 0.62;
  ctx.fill();
  ctx.restore();
}

function drawFurHalo(x, y, width, height, scale) {
  ctx.save();
  ctx.lineWidth = Math.max(1.5, 2.2 * scale);
  ctx.strokeStyle = "rgba(244,244,240,0.34)";
  ctx.setLineDash([Math.max(4, 7 * scale), Math.max(8, 14 * scale)]);
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height * 0.55, width * 0.48, height * 0.58, 0, Math.PI * 0.96, Math.PI * 2.04);
  ctx.stroke();
  ctx.restore();
}

function drawCatNose(point, size) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(point.x, point.y - size * 0.75);
  ctx.bezierCurveTo(point.x - size * 1.15, point.y - size * 0.45, point.x - size * 0.8, point.y + size * 0.75, point.x, point.y + size * 0.82);
  ctx.bezierCurveTo(point.x + size * 0.8, point.y + size * 0.75, point.x + size * 1.15, point.y - size * 0.45, point.x, point.y - size * 0.75);
  ctx.closePath();
  ctx.fillStyle = "rgba(240,167,180,0.86)";
  ctx.fill();
  ctx.lineWidth = Math.max(1.25, size * 0.18);
  ctx.strokeStyle = "rgba(36,21,26,0.52)";
  ctx.stroke();
  ctx.restore();
}

function drawWhiskers(leftCheek, rightCheek, faceWidth, scale) {
  const length = Math.max(34 * scale, faceWidth * 0.32);
  const gap = Math.max(8 * scale, faceWidth * 0.035);
  ctx.save();
  ctx.lineWidth = Math.max(1.4, 2.2 * scale);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(244,244,240,0.78)";
  drawWhiskerSet(leftCheek, -1, length, gap);
  drawWhiskerSet(rightCheek, 1, length, gap);
  ctx.restore();
}

function drawWhiskerSet(anchor, direction, length, gap) {
  const startX = anchor.x + direction * gap;
  const endX = anchor.x + direction * length;
  for (const offset of [-0.18, 0, 0.18]) {
    ctx.beginPath();
    ctx.moveTo(startX, anchor.y);
    ctx.quadraticCurveTo(
      anchor.x + direction * length * 0.5,
      anchor.y + length * offset * 0.5,
      endX,
      anchor.y + length * offset
    );
    ctx.stroke();
  }
}

function drawTinyCatMouth(nose, faceWidth, scale) {
  const radius = Math.max(8 * scale, faceWidth * 0.04);
  ctx.save();
  ctx.lineWidth = Math.max(1.4, 2 * scale);
  ctx.strokeStyle = "rgba(244,244,240,0.68)";
  ctx.beginPath();
  ctx.moveTo(nose.x, nose.y + radius * 0.6);
  ctx.quadraticCurveTo(nose.x - radius, nose.y + radius * 1.4, nose.x - radius * 1.8, nose.y + radius * 0.8);
  ctx.moveTo(nose.x, nose.y + radius * 0.6);
  ctx.quadraticCurveTo(nose.x + radius, nose.y + radius * 1.4, nose.x + radius * 1.8, nose.y + radius * 0.8);
  ctx.stroke();
  ctx.restore();
}

function drawHandOverlay(handTelemetry) {
  if (!handTelemetry?.hands?.length) return;
  const { width, height } = els.canvas;
  ctx.save();
  for (const hand of handTelemetry.hands || []) {
    drawHandPoints(hand.points, width, height, handTelemetry.stale);
  }
  ctx.restore();
}

function drawBodyOverlay(bodyTelemetry) {
  if (!bodyTelemetry?.poses?.length) return;
  const { width, height } = els.canvas;
  ctx.save();
  for (const pose of bodyTelemetry.poses || []) {
    drawBodyPoints(pose.keypoints, width, height, bodyTelemetry.stale);
  }
  ctx.restore();
}

function staleFaceTelemetry(now, detectError = null) {
  if (!state.lastValidFace || now - state.lastValidFaceAt > FACE_HOLD_MS) return null;
  return {
    ...state.lastValidFace,
    stale: true,
    lastSeenMsAgo: Math.round(now - state.lastValidFaceAt),
    detectError
  };
}

function staleHandTelemetry(now, detectError = null) {
  if (!state.lastValidHands || now - state.lastValidHandsAt > HAND_HOLD_MS) return null;
  return {
    ...state.lastValidHands,
    stale: true,
    lastSeenMsAgo: Math.round(now - state.lastValidHandsAt),
    detectError
  };
}

function staleBodyTelemetry(now, detectError = null) {
  if (!state.lastValidBody || now - state.lastValidBodyAt > BODY_HOLD_MS) return null;
  return {
    ...state.lastValidBody,
    stale: true,
    lastSeenMsAgo: Math.round(now - state.lastValidBodyAt),
    detectError
  };
}

function drawFacePoints(points, width, height, stale) {
  const scale = canvasScale();
  ctx.globalAlpha = stale ? 0.38 : 0.85;
  ctx.fillStyle = stale ? "#94a3b8" : "#67e8f9";
  const step = els.denseFaceToggle.checked ? 1 : 3;
  for (let i = 0; i < points.length; i += step) {
    const point = toCanvasPoint(points[i], width, height);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.35 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  if (els.eyeScanToggle.checked) drawEyePoints(points, width, height, stale);
  ctx.globalAlpha = 1;
}

function drawEyePoints(points, width, height, stale) {
  const scale = canvasScale();
  ctx.fillStyle = stale ? "#cbd5e1" : "#facc15";
  for (const index of EYE_LANDMARK_INDICES) {
    const point = points[index];
    if (!point) continue;
    const p = toCanvasPoint(point, width, height);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHandPoints(points, width, height, stale) {
  const scale = canvasScale();
  ctx.globalAlpha = stale ? 0.35 : 0.86;
  ctx.fillStyle = stale ? "#94a3b8" : "#86efac";
  for (const point of points) {
    const p = toCanvasPoint(point, width, height);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.1 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBodyPoints(keypoints, width, height, stale) {
  const scale = canvasScale();
  ctx.globalAlpha = stale ? 0.3 : 0.78;
  ctx.fillStyle = stale ? "#94a3b8" : "#fb7185";
  for (const keypoint of keypoints) {
    if (keypoint.visibility !== null && keypoint.visibility < 0.35) continue;
    const p = toCanvasPoint(keypoint.point, width, height);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.35 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function takeSnapshot() {
  if (!state.stream) return;
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `camera-frame-${Date.now()}.png`);
  }, "image/png");
}

function runOneTimeScan() {
  state.oneTimeScan = {
    status: "blocked",
    storedHash: null,
    reason: "Biometric hash storage is disabled. Use passkey/WebAuthn binding so the device verifies Face ID/Touch ID without exposing biometric data."
  };
  setStatus("One-time biometric hash storage disabled; use passkey binding.");
  updateReadouts();
}

function toggleRecording() {
  if (state.isRecording) {
    if (state.recorder?.state !== "inactive") state.recorder.stop();
    return;
  }
  if (!state.stream || !els.canvas.captureStream || !window.MediaRecorder) {
    setStatus("Recording is not available in this browser.");
    return;
  }

  const fps = clampInt(els.fpsInput.value, 1, 240, 30);
  const stream = els.canvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";

  state.recordedChunks = [];
  state.recorder = new MediaRecorder(stream, { mimeType });
  state.recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) state.recordedChunks.push(event.data);
  });
  state.recorder.addEventListener("stop", () => {
    const blob = new Blob(state.recordedChunks, { type: mimeType });
    state.isRecording = false;
    updateButtons();
    if (blob.size > 0) downloadBlob(blob, `camera-recording-${Date.now()}.webm`);
    setStatus("Recording stopped");
  });
  state.recorder.start(250);
  state.isRecording = true;
  setStatus("Recording");
  updateButtons();
}

function shouldRenderFrame(now) {
  const interval = 1000 / renderFpsTarget();
  if (!state.lastRenderAt || now - state.lastRenderAt >= interval) {
    state.lastRenderAt = now;
    return true;
  }
  return false;
}

function updateReadoutsThrottled(now) {
  if (now - state.lastReadoutAt >= 250) {
    state.lastReadoutAt = now;
    updateReadouts();
  }
}

function renderFpsTarget() {
  return clampInt(els.renderFpsInput.value, 1, 240, 30);
}

function cameraFpsText() {
  return state.settings.frameRate ? Number(state.settings.frameRate).toFixed(1) : "-";
}

function updateFps(now) {
  state.frameCount += 1;
  const elapsed = now - state.lastFpsAt;
  if (elapsed >= 1000) {
    state.fps = (state.frameCount * 1000) / elapsed;
    state.frameCount = 0;
    state.lastFpsAt = now;
  }
}

function updateReadouts() {
  refreshTrackInfo();
  const q = state.latestQuality;
  renderDl(els.streamReadout, {
    status: state.stream ? "streaming" : "stopped",
    cameraFps: cameraFpsText(),
    renderFps: state.fps ? state.fps.toFixed(1) : "0",
    targetRenderFps: String(renderFpsTarget()),
    resolution: state.settings.width && state.settings.height ? `${state.settings.width} x ${state.settings.height}` : "-",
    output: outputLabel(),
    rotation: `${rotationDegrees()} deg`,
    aspect: els.aspectSelect.value,
    fit: els.fitSelect.value,
    device: state.settings.deviceId ? shortId(state.settings.deviceId) : "-",
    audio: audioStatusText(),
    brightness: q ? q.brightness.toFixed(1) : "-",
    sharpness: q ? q.sharpness.toFixed(1) : "-",
    recording: state.isRecording ? "yes" : "no"
  });

  renderSessionReadout();
  renderReviewCards();
  updateChildMode();
  els.faceReadout.textContent = graphqlResponseText();
  els.capabilitiesReadout.textContent = graphqlCapabilitiesResponseText();
  updateFaceLoader();
  updateHandLoader();
  updateBodyLoader();
  updateAudioLoader();
  updateSummaries();
  updateButtons();
}

function graphqlResponseText() {
  return formatJson({
    data: {
      telemetry: telemetrySnapshot(),
      cameraCapabilities: capabilitiesSnapshot()
    }
  });
}

function graphqlCapabilitiesResponseText() {
  return formatJson({
    data: {
      cameraCapabilities: capabilitiesSnapshot()
    }
  });
}

function telemetrySnapshot() {
  const q = state.latestQuality;
  return {
    __typename: "Telemetry",
    stream: {
      __typename: "StreamTelemetry",
      status: state.stream ? "streaming" : "stopped",
      cameraFps: state.settings.frameRate || null,
      renderFps: Number(state.fps.toFixed(1)),
      targetRenderFps: renderFpsTarget(),
      resolution: state.settings.width && state.settings.height ? {
        __typename: "Size",
        width: state.settings.width,
        height: state.settings.height
      } : null,
      output: state.renderLayout ? {
        __typename: "Size",
        width: Math.round(state.renderLayout.frameRect.width),
        height: Math.round(state.renderLayout.frameRect.height)
      } : null,
      rotation: rotationDegrees(),
      aspect: els.aspectSelect.value,
      fit: els.fitSelect.value,
      quality: q ? {
        __typename: "FrameQuality",
        brightness: Number(q.brightness.toFixed(1)),
        sharpness: Number(q.sharpness.toFixed(1))
      } : null,
      recording: state.isRecording
    },
    face: faceTelemetrySnapshot(),
    hands: handTelemetrySnapshot(),
    body: bodyTelemetrySnapshot(),
    audio: audioTelemetrySnapshot(),
    interpretation: interpretationSnapshot(),
    buffer: bufferTelemetrySnapshot(),
    training: trainingTelemetrySnapshot(),
    fingerprint: fingerprintSnapshot(),
    oneTimeScan: oneTimeScanSnapshot()
  };
}

function faceTelemetrySnapshot() {
  if (!els.metricsToggle.checked) {
    return {
      __typename: "FaceTelemetry",
      enabled: false,
      version: null,
      delegate: null,
      modelReady: false,
      modelLoading: false,
      modelError: null,
      stale: false,
      lastSeenMsAgo: null,
      detectError: null,
      count: null,
      faces: []
    };
  }
  const base = {
    __typename: "FaceTelemetry",
    enabled: true,
    version: MEDIAPIPE_VERSION,
    delegate: state.faceDelegate,
    modelReady: state.faceReady,
    modelLoading: state.faceLoading,
    modelError: state.faceError,
    stale: Boolean(state.latestFace?.stale),
    lastSeenMsAgo: state.latestFace?.lastSeenMsAgo ?? null
  };
  if (!state.latestFace || state.latestFace.error) {
    return { ...base, detectError: state.latestFace?.error || state.latestFace?.detectError || null, count: null, faces: [] };
  }
  return {
    ...base,
    count: state.latestFace.count,
    detectError: state.latestFace.detectError || null,
    faces: (state.latestFace.faces || []).slice(0, 2).map((face) => ({
      __typename: "Face",
      index: face.index,
      landmarks: face.pointCount,
      center: normalizePoint(face.center, "Point2D"),
      box: normalizeBox(face.box),
      eyeOpen: Number(face.eyeOpen.toFixed(3)),
      blink: face.blink,
      mouthOpen: Number(face.mouthOpen.toFixed(3)),
      pose: face.pose ? {
        __typename: "FacePose",
        yaw: Number(face.pose.yaw.toFixed(1)),
        pitch: Number(face.pose.pitch.toFixed(1)),
        roll: Number(face.pose.roll.toFixed(1))
      } : null,
      regions: face.regions,
      eyeScan: face.eyeScan,
      tongue: tongueTelemetry(face),
      blendshapes: face.blend.map((item) => ({
        __typename: "Blendshape",
        name: item.name,
        score: Number(item.score.toFixed(3))
      }))
    }))
  };
}

function bodyTelemetrySnapshot() {
  if (!els.bodyTelemetryToggle.checked) {
    return {
      __typename: "BodyTelemetry",
      enabled: false,
      version: null,
      delegate: null,
      modelReady: false,
      modelLoading: false,
      modelError: null,
      stale: false,
      lastSeenMsAgo: null,
      detectError: null,
      count: null,
      poses: []
    };
  }

  const base = {
    __typename: "BodyTelemetry",
    enabled: true,
    version: MEDIAPIPE_VERSION,
    delegate: state.bodyDelegate,
    modelReady: state.bodyReady,
    modelLoading: state.bodyLoading,
    modelError: state.bodyError,
    stale: Boolean(state.latestBody?.stale),
    lastSeenMsAgo: state.latestBody?.lastSeenMsAgo ?? null
  };
  if (!state.latestBody || state.latestBody.error) {
    return { ...base, detectError: state.latestBody?.error || state.latestBody?.detectError || null, count: null, poses: [] };
  }
  return {
    ...base,
    count: state.latestBody.count,
    detectError: state.latestBody.detectError || null,
    poses: (state.latestBody.poses || []).slice(0, 2).map((pose) => ({
      __typename: "Pose",
      index: pose.index,
      landmarks: pose.pointCount,
      center: normalizePoint(pose.center),
      box: normalizeBox(pose.box),
      keypoints: pose.keypoints.map((keypoint) => ({
        __typename: "PoseKeypoint",
        name: keypoint.name,
        point: normalizePoint(keypoint.point),
        z: numberOrNull(keypoint.point.z, 4),
        visibility: numberOrNull(keypoint.visibility, 3),
        presence: numberOrNull(keypoint.presence, 3)
      }))
    }))
  };
}

function handTelemetrySnapshot() {
  if (!els.handTelemetryToggle.checked) {
    return {
      __typename: "HandTelemetry",
      enabled: false,
      version: null,
      delegate: null,
      modelReady: false,
      modelLoading: false,
      modelError: null,
      stale: false,
      lastSeenMsAgo: null,
      detectError: null,
      count: null,
      hands: []
    };
  }

  const base = {
    __typename: "HandTelemetry",
    enabled: true,
    version: MEDIAPIPE_VERSION,
    delegate: state.handDelegate,
    modelReady: state.handReady,
    modelLoading: state.handLoading,
    modelError: state.handError,
    stale: Boolean(state.latestHands?.stale),
    lastSeenMsAgo: state.latestHands?.lastSeenMsAgo ?? null
  };
  if (!state.latestHands || state.latestHands.error) {
    return { ...base, detectError: state.latestHands?.error || state.latestHands?.detectError || null, count: null, hands: [] };
  }
  return {
    ...base,
    count: state.latestHands.count,
    detectError: state.latestHands.detectError || null,
    hands: (state.latestHands.hands || []).slice(0, 2).map((hand) => ({
      __typename: "Hand",
      index: hand.index,
      label: hand.label,
      score: hand.score === null ? null : Number(hand.score.toFixed(3)),
      landmarks: hand.pointCount,
      box: normalizeBox(hand.box),
      wrist: normalizePoint(hand.wrist),
      thumbTip: normalizePoint(hand.thumbTip),
      indexTip: normalizePoint(hand.indexTip),
      middleTip: normalizePoint(hand.middleTip),
      ringTip: normalizePoint(hand.ringTip),
      pinkyTip: normalizePoint(hand.pinkyTip),
      openness: Number(hand.openness.toFixed(3)),
      pinch: Number(hand.pinch.toFixed(3))
    }))
  };
}

function audioTelemetrySnapshot() {
  const supported = Boolean(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext));
  if (!els.audioTelemetryToggle.checked) {
    return {
      __typename: "AudioTelemetry",
      enabled: false,
      supported,
      ready: false,
      loading: false,
      error: null,
      capturedAt: null,
      rms: null,
      peak: null,
      zeroCrossingRate: null,
      spectralCentroidHz: null,
      pitchHz: null,
      voiceActivity: false,
      sampleRate: null,
      fftSize: null
    };
  }

  const audio = state.latestAudio;
  return {
    __typename: "AudioTelemetry",
    enabled: true,
    supported,
    ready: state.audioReady,
    loading: state.audioLoading,
    error: state.audioError,
    capturedAt: audio?.capturedAt || null,
    rms: numberOrNull(audio?.rms, 4),
    peak: numberOrNull(audio?.peak, 4),
    zeroCrossingRate: numberOrNull(audio?.zeroCrossingRate, 4),
    spectralCentroidHz: numberOrNull(audio?.spectralCentroidHz, 1),
    pitchHz: numberOrNull(audio?.pitchHz, 1),
    voiceActivity: Boolean(audio?.voiceActivity),
    sampleRate: audio?.sampleRate || state.audioContext?.sampleRate || null,
    fftSize: audio?.fftSize || state.audioAnalyser?.fftSize || null
  };
}

function interpretationSnapshot() {
  const time = timeContextSnapshot();
  const face = state.latestFace?.faces?.[0] || null;
  const hands = state.latestHands?.hands || [];
  const body = state.latestBody?.poses?.[0] || null;
  const audio = state.latestAudio || null;
  const affect = affectSnapshot(face, audio, body);
  return {
    __typename: "InterpretationTelemetry",
    time,
    affect,
    needs: needHypotheses(face, hands, body, audio, affect, time),
    safety: {
      __typename: "InterpretationSafety",
      mode: "assistive_hypothesis",
      diagnostic: false,
      reason: "Signals are local assistive hints for a caregiver, not diagnosis or an automatic decision."
    }
  };
}

function captureFeatureSample(now) {
  const sample = currentFeatureSample(now);
  state.featureBuffer.push(sample);
  trimFeatureBuffer(now);
  state.latestRolling = rollingFeatures(state.featureBuffer);
}

function currentFeatureSample(now = performance.now()) {
  const face = summarizeFaceSnapshot(faceTelemetrySnapshot());
  const hands = summarizeHandsSnapshot(handTelemetrySnapshot());
  const body = summarizeBodySnapshot(bodyTelemetrySnapshot());
  const audio = audioTelemetrySnapshot();
  const interpretation = interpretationSnapshot();
  return {
    __typename: "FeatureSample",
    perfAt: Math.round(now),
    capturedAt: localIsoString(new Date()),
    features: flatFeatures(face, hands, body, audio, interpretation),
    face,
    hands,
    body,
    audio,
    interpretation
  };
}

function summarizeFaceSnapshot(snapshot) {
  const first = snapshot.faces?.[0] || null;
  return {
    __typename: "FeatureFace",
    enabled: snapshot.enabled,
    ready: Boolean(snapshot.modelReady),
    stale: Boolean(snapshot.stale),
    count: snapshot.count || 0,
    eyeOpen: first?.eyeOpen ?? null,
    blink: Boolean(first?.blink),
    mouthOpen: first?.mouthOpen ?? null,
    pose: first?.pose || null,
    regions: first?.regions || [],
    blendshapes: first?.blendshapes || [],
    topBlendshape: first?.blendshapes?.[0] || null
  };
}

function summarizeHandsSnapshot(snapshot) {
  const hands = snapshot.hands || [];
  return {
    __typename: "FeatureHands",
    enabled: snapshot.enabled,
    ready: Boolean(snapshot.modelReady),
    stale: Boolean(snapshot.stale),
    count: snapshot.count || 0,
    hands: hands.map((hand) => ({
      index: hand.index,
      label: hand.label,
      openness: hand.openness,
      pinch: hand.pinch,
      wrist: hand.wrist,
      thumbTip: hand.thumbTip,
      indexTip: hand.indexTip
    })),
    avgOpenness: averageNumber(hands.map((hand) => hand.openness)),
    avgPinch: averageNumber(hands.map((hand) => hand.pinch))
  };
}

function summarizeBodySnapshot(snapshot) {
  const pose = snapshot.poses?.[0] || null;
  const visibleKeypoints = pose?.keypoints?.filter((keypoint) => keypoint.visibility === null || keypoint.visibility >= 0.35) || [];
  return {
    __typename: "FeatureBody",
    enabled: snapshot.enabled,
    ready: Boolean(snapshot.modelReady),
    stale: Boolean(snapshot.stale),
    count: snapshot.count || 0,
    center: pose?.center || null,
    box: pose?.box || null,
    visibleKeypoints: visibleKeypoints.length,
    keypointCount: pose?.keypoints?.length || 0
  };
}

function flatFeatures(face, hands, body, audio, interpretation) {
  const topNeed = interpretation.needs?.[0] || null;
  return {
    __typename: "FlatFeatures",
    faceLocked: face.count > 0 && !face.stale,
    faceCount: face.count,
    eyeOpen: numberOrNull(face.eyeOpen, 3),
    blink: face.blink,
    mouthOpen: numberOrNull(face.mouthOpen, 3),
    headYaw: numberOrNull(face.pose?.yaw, 1),
    headPitch: numberOrNull(face.pose?.pitch, 1),
    headRoll: numberOrNull(face.pose?.roll, 1),
    handCount: hands.count,
    handOpenness: numberOrNull(hands.avgOpenness, 3),
    handPinch: numberOrNull(hands.avgPinch, 3),
    bodyVisible: body.count > 0,
    bodyVisibleKeypoints: body.visibleKeypoints,
    voiceActivity: Boolean(audio.voiceActivity),
    audioRms: numberOrNull(audio.rms, 4),
    audioPeak: numberOrNull(audio.peak, 4),
    pitchHz: numberOrNull(audio.pitchHz, 1),
    affectPrimary: interpretation.affect.primary,
    valence: interpretation.affect.valence,
    arousal: interpretation.affect.arousal,
    attention: interpretation.affect.attention,
    engagement: interpretation.affect.engagement,
    topNeed: topNeed?.name || null,
    topNeedConfidence: topNeed?.confidence ?? null
  };
}

function trimFeatureBuffer(now = performance.now()) {
  const cutoff = now - bufferWindowMs();
  state.featureBuffer = state.featureBuffer.filter((sample) => sample.perfAt >= cutoff);
}

function bufferTelemetrySnapshot() {
  const now = performance.now();
  trimFeatureBuffer(now);
  const first = state.featureBuffer[0] || null;
  const latest = state.featureBuffer[state.featureBuffer.length - 1] || null;
  const rolling = rollingFeatures(state.featureBuffer);
  state.latestRolling = rolling;
  return {
    __typename: "BufferTelemetry",
    windowSeconds: bufferWindowSeconds(),
    sampleCount: state.featureBuffer.length,
    oldestMsAgo: first ? Math.round(now - first.perfAt) : null,
    latestMsAgo: latest ? Math.round(now - latest.perfAt) : null,
    rolling
  };
}

function rollingFeatures(samples) {
  const count = samples.length || 1;
  const features = samples.map((sample) => sample.features);
  const needScores = {};
  const needEvidence = {};
  for (const sample of samples) {
    for (const need of sample.interpretation.needs || []) {
      needScores[need.name] = (needScores[need.name] || 0) + need.confidence;
      needEvidence[need.name] = need.evidence;
    }
  }
  const [topNeedName, topNeedScore] = Object.entries(needScores)
    .sort((a, b) => b[1] - a[1])[0] || [];

  return {
    __typename: "RollingFeatures",
    faceLockRatio: Number((features.filter((item) => item.faceLocked).length / count).toFixed(3)),
    voiceActivityRatio: Number((features.filter((item) => item.voiceActivity).length / count).toFixed(3)),
    avgValence: averageFeature(features, "valence", 3),
    avgArousal: averageFeature(features, "arousal", 3),
    avgAttention: averageFeature(features, "attention", 3),
    avgEngagement: averageFeature(features, "engagement", 3),
    avgMouthOpen: averageFeature(features, "mouthOpen", 3),
    avgEyeOpen: averageFeature(features, "eyeOpen", 3),
    avgHandOpenness: averageFeature(features, "handOpenness", 3),
    topNeed: topNeedName ? {
      __typename: "NeedHypothesis",
      name: topNeedName,
      confidence: Number((topNeedScore / count).toFixed(3)),
      evidence: needEvidence[topNeedName] || []
    } : null
  };
}

function trainingTelemetrySnapshot() {
  const last = state.labels[state.labels.length - 1] || null;
  return {
    __typename: "TrainingTelemetry",
    labelCount: state.labels.length,
    lastLabel: last ? labelEventSummary(last) : null
  };
}

function addLabelEvent(kind, label) {
  const now = performance.now();
  if (state.featureBuffer.length === 0) captureFeatureSample(now);
  const samples = state.featureBuffer.slice();
  const event = {
    __typename: "LabelEvent",
    id: `label_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    createdAt: localIsoString(new Date()),
    kind,
    label,
    windowSeconds: bufferWindowSeconds(),
    sampleCount: samples.length,
    rolling: rollingFeatures(samples),
    latest: samples[samples.length - 1]?.features || null,
    samples: samples.map((sample) => ({
      capturedAt: sample.capturedAt,
      features: sample.features
    }))
  };
  state.labels.push(event);
  state.labels = state.labels.slice(-MAX_LABEL_EVENTS);
  saveLabels();
  setStatus(`Saved ${kind} label: ${label}`);
  updateReadouts();
}

function exportLabelEvents() {
  if (state.labels.length === 0) {
    setStatus("No labels to export.");
    return;
  }
  const lines = state.labels.map((event) => JSON.stringify(event)).join("\n");
  const blob = new Blob([`${lines}\n`], { type: "application/x-ndjson" });
  downloadBlob(blob, `assistive-biometrics-labels-${Date.now()}.jsonl`);
  setStatus(`Exported ${state.labels.length} labels`);
}

function clearLabelEvents() {
  if (state.labels.length === 0) return;
  const ok = window.confirm("Clear local label events?");
  if (!ok) return;
  state.labels = [];
  saveLabels();
  setStatus("Local labels cleared");
  updateReadouts();
}

function restoreLabels() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LABELS_STORAGE_KEY) || "[]");
    state.labels = Array.isArray(parsed) ? parsed.slice(-MAX_LABEL_EVENTS) : [];
  } catch {
    state.labels = [];
  }
}

function saveLabels() {
  try {
    localStorage.setItem(LABELS_STORAGE_KEY, JSON.stringify(state.labels.slice(-MAX_LABEL_EVENTS)));
  } catch {
    setStatus("Could not save labels in local storage.");
  }
}

function labelEventSummary(event) {
  return {
    __typename: "LabelEvent",
    id: event.id,
    kind: event.kind,
    label: event.label,
    createdAt: event.createdAt,
    windowSeconds: event.windowSeconds,
    sampleCount: event.sampleCount
  };
}

function fingerprintSnapshot() {
  return {
    __typename: "FingerprintCheck",
    enabled: els.fingerprintToggle.checked,
    supported: Boolean(window.PublicKeyCredential),
    mode: "webauthn-passkey",
    reason: els.fingerprintToggle.checked
      ? "Store passkey credential id/public key later; do not store biometric hashes or fingerprint ridge data."
      : "Disabled."
  };
}

function oneTimeScanSnapshot() {
  return {
    __typename: "OneTimeScan",
    status: state.oneTimeScan.status,
    storedHash: state.oneTimeScan.storedHash,
    reason: state.oneTimeScan.reason
  };
}

function capabilitiesSnapshot() {
  const track = state.track;
  const settings = track?.getSettings ? track.getSettings() : state.settings;
  const capabilities = track?.getCapabilities ? track.getCapabilities() : state.capabilities;
  const constraints = track?.getConstraints ? track.getConstraints() : {};
  return {
    __typename: "CameraCapabilities",
    requested: {
      __typename: "CameraRequest",
      width: Number(els.widthInput.value) || null,
      height: Number(els.heightInput.value) || null,
      cameraFps: Number(els.fpsInput.value) || null,
      renderFps: renderFpsTarget(),
      rotation: rotationDegrees(),
      aspect: els.aspectSelect.value,
      fit: els.fitSelect.value
    },
    track: {
      __typename: "MediaTrack",
      active: Boolean(track),
      readyState: track?.readyState || "none",
      enabled: track?.enabled ?? null,
      muted: track?.muted ?? null,
      label: track?.label || null,
      constraints,
      settings,
      capabilities
    },
    devices: state.devices.map((device, index) => ({
      __typename: "VideoInputDevice",
      index,
      label: device.label || null,
      deviceId: shortId(device.deviceId || ""),
      groupId: shortId(device.groupId || "")
    }))
  };
}

function normalizePoint(point, typename = "Point2D") {
  if (!point) return null;
  return { __typename: typename, x: Number(point.x.toFixed(4)), y: Number(point.y.toFixed(4)) };
}

function normalizeBox(box) {
  if (!box) return null;
  return {
    __typename: "Box2D",
    x: Number(box.x.toFixed(4)),
    y: Number(box.y.toFixed(4)),
    width: Number(box.width.toFixed(4)),
    height: Number(box.height.toFixed(4))
  };
}

function tongueTelemetry(face) {
  const confidence = Math.max(0, Math.min(1, (face.mouthOpen - 0.22) / 0.42));
  return {
    __typename: "TongueTelemetry",
    supported: false,
    method: "mouth_open_landmark_heuristic",
    candidate: face.mouthOpen > 0.42,
    confidence: Number(confidence.toFixed(3)),
    requiredModel: "mouth/tongue segmentation or a child-specific mouth-state classifier",
    reason: "Current signal only infers a possible tongue/mouth event from mouth landmarks; it does not visually classify the tongue."
  };
}

function faceRegions(points) {
  return Object.entries(FACE_REGIONS).map(([name, indices]) => {
    const regionPoints = indices.map((index) => points[index]).filter(Boolean);
    const box = boundingBox(regionPoints);
    return {
      __typename: "FaceRegion",
      name,
      center: normalizePoint({ x: box.x + box.width / 2, y: box.y + box.height / 2 }),
      box: normalizeBox(box),
      coverage: Number((box.width * box.height).toFixed(4))
    };
  });
}

function eyeScan(points) {
  return {
    __typename: "EyeScan",
    enabled: els.eyeScanToggle.checked,
    left: eyeMetrics(points, "left"),
    right: eyeMetrics(points, "right")
  };
}

function eyeMetrics(points, side) {
  const left = side === "left";
  const indices = left ? FACE_REGIONS.leftEye : FACE_REGIONS.rightEye;
  const regionPoints = indices.map((index) => points[index]).filter(Boolean);
  if (regionPoints.length === 0) return null;
  const box = boundingBox(regionPoints);
  return {
    __typename: "EyeMetrics",
    center: normalizePoint({ x: box.x + box.width / 2, y: box.y + box.height / 2 }),
    openness: Number((left
      ? ratioDistance(points[159], points[145], points[33], points[133])
      : ratioDistance(points[386], points[374], points[362], points[263])
    ).toFixed(3)),
    iris: normalizePoint(irisCenter(points, left))
  };
}

function irisCenter(points, left) {
  const indices = left ? [468, 469, 470, 471, 472] : [473, 474, 475, 476, 477];
  const iris = indices.map((index) => points[index]).filter(Boolean);
  if (iris.length === 0) return null;
  return averagePoint(iris);
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collectSettings()));
  } catch {
    // Local storage can be disabled; the app should keep streaming anyway.
  }
}

function restoreSettings() {
  const saved = readSettings();
  const canRestoreLayout = saved.settingsVersion === SETTINGS_VERSION;
  setNumberInput(els.widthInput, saved.width);
  setNumberInput(els.heightInput, saved.height);
  setNumberInput(els.fpsInput, saved.fps);
  setNumberInput(els.renderFpsInput, saved.renderFps);
  setNumberInput(els.bufferSecondsInput, saved.bufferSeconds);
  setNumberInput(els.childSummarySecondsInput, saved.childSummarySeconds);
  setSelectValue(els.rotationSelect, saved.rotation);
  setSelectValue(els.aspectSelect, saved.aspect);
  setSelectValue(els.fitSelect, saved.fit);
  if (canRestoreLayout) {
    setCheckboxValue(els.mirrorToggle, saved.mirror);
    setCheckboxValue(els.overlayToggle, saved.overlay);
    setCheckboxValue(els.metricsToggle, saved.metrics);
    setCheckboxValue(els.denseFaceToggle, saved.denseFace);
    setCheckboxValue(els.eyeScanToggle, saved.eyeScan);
    setCheckboxValue(els.handTelemetryToggle, saved.handTelemetry);
    setCheckboxValue(els.bodyTelemetryToggle, saved.bodyTelemetry);
    setCheckboxValue(els.audioTelemetryToggle, saved.audioTelemetry);
    setCheckboxValue(els.fingerprintToggle, saved.fingerprint);
    setCheckboxValue(els.autoStartToggle, saved.autoStart);
    setCheckboxValue(els.childModeToggle, saved.childMode);
  }

  const openSections = canRestoreLayout ? saved.openSections || {} : {};
  for (const details of document.querySelectorAll("[data-persist-open]")) {
    const key = details.dataset.persistOpen;
    const defaultOpen = details.hasAttribute("open");
    details.open = typeof openSections[key] === "boolean" ? openSections[key] : defaultOpen;
  }
}

function collectSettings() {
  const openSections = {};
  for (const details of document.querySelectorAll("[data-persist-open]")) {
    openSections[details.dataset.persistOpen] = details.open;
  }
  return {
    settingsVersion: SETTINGS_VERSION,
    deviceId: els.deviceSelect.value || null,
    width: Number(els.widthInput.value) || 1280,
    height: Number(els.heightInput.value) || 720,
    fps: Number(els.fpsInput.value) || 30,
    renderFps: Number(els.renderFpsInput.value) || 30,
    bufferSeconds: bufferWindowSeconds(),
    childSummarySeconds: childSummaryWindowSeconds(),
    rotation: els.rotationSelect.value,
    aspect: els.aspectSelect.value,
    fit: els.fitSelect.value,
    mirror: els.mirrorToggle.checked,
    overlay: els.overlayToggle.checked,
    metrics: els.metricsToggle.checked,
    denseFace: els.denseFaceToggle.checked,
    eyeScan: els.eyeScanToggle.checked,
    handTelemetry: els.handTelemetryToggle.checked,
    bodyTelemetry: els.bodyTelemetryToggle.checked,
    audioTelemetry: els.audioTelemetryToggle.checked,
    fingerprint: els.fingerprintToggle.checked,
    autoStart: els.autoStartToggle.checked,
    childMode: els.childModeToggle.checked,
    openSections
  };
}

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function setNumberInput(input, value) {
  if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
    input.value = String(value);
  }
}

function setSelectValue(select, value) {
  if (value !== undefined && value !== null && [...select.options].some((option) => option.value === String(value))) {
    select.value = String(value);
  }
}

function setCheckboxValue(input, value) {
  if (typeof value === "boolean") input.checked = value;
}

function updateSummaries() {
  els.controlSummary.textContent = controlSummaryText();
  els.settingsSummary.textContent = settingsSummaryText();
  els.streamSummary.textContent = state.stream
    ? `${cameraFpsText()} cam / ${state.fps ? state.fps.toFixed(0) : "0"} render / ${outputLabel()}`
    : "stopped";
  els.faceSummary.textContent = faceSummaryText();
  els.sessionSummary.textContent = `${state.featureBuffer.length} samples / ${state.labels.length} labels`;
  els.reviewSummary.textContent = reviewSummaryText();
  const capabilityCount = Object.keys(state.capabilities || {}).length;
  els.capabilitiesSummary.textContent = capabilityCount ? `${capabilityCount} keys` : "empty";
}

function controlSummaryText() {
  const stream = state.stream ? "streaming" : "stopped";
  const recording = state.isRecording ? " / rec" : "";
  const face = els.metricsToggle.checked
    ? state.faceReady ? ` / face ${state.faceDelegate || "on"}` : state.faceLoading ? " / face loading" : " / face off"
    : "";
  const hands = els.handTelemetryToggle.checked
    ? state.handReady ? ` / hands ${state.handDelegate || "on"}` : state.handLoading ? " / hands loading" : " / hands off"
    : "";
  const body = els.bodyTelemetryToggle.checked
    ? state.bodyReady ? ` / body ${state.bodyDelegate || "on"}` : state.bodyLoading ? " / body loading" : " / body off"
    : "";
  const audio = els.audioTelemetryToggle.checked
    ? state.audioReady ? " / audio on" : state.audioLoading ? " / audio loading" : state.audioError ? " / audio error" : " / audio off"
    : "";
  return `${stream}${recording}${face}${hands}${body}${audio}`;
}

function settingsSummaryText() {
  const width = els.widthInput.value || "-";
  const height = els.heightInput.value || "-";
  const cameraFps = els.fpsInput.value || "-";
  const renderFps = els.renderFpsInput.value || "-";
  return `${width} x ${height} / ${cameraFps} cam / ${renderFps} render / ${rotationDegrees()} deg`;
}

function faceSummaryText() {
  if (!els.metricsToggle.checked) return "off";
  if (state.faceLoading) return "loading";
  if (!state.faceReady) return "not loaded";
  if (!state.latestFace) return "ready";
  if (state.latestFace.error) return "error";
  return `${state.latestFace.count} face${state.latestFace.count === 1 ? "" : "s"}`;
}

function reviewSummaryText() {
  const sample = state.featureBuffer[state.featureBuffer.length - 1];
  if (!sample) return "waiting";
  const topNeed = sample.interpretation.needs?.[0];
  return topNeed ? `${topNeed.name} ${Math.round(topNeed.confidence * 100)}%` : sample.interpretation.affect.primary;
}

function renderSessionReadout() {
  const buffer = bufferTelemetrySnapshot();
  const rolling = buffer.rolling;
  renderDl(els.sessionReadout, {
    bufferWindow: `${buffer.windowSeconds}s`,
    samples: buffer.sampleCount,
    labels: state.labels.length,
    lastLabel: state.labels[state.labels.length - 1]
      ? `${state.labels[state.labels.length - 1].kind}:${state.labels[state.labels.length - 1].label}`
      : "-",
    faceLock: `${Math.round(rolling.faceLockRatio * 100)}%`,
    voice: `${Math.round(rolling.voiceActivityRatio * 100)}%`,
    valence: rolling.avgValence ?? "-",
    arousal: rolling.avgArousal ?? "-",
    topNeed: rolling.topNeed ? `${rolling.topNeed.name} ${Math.round(rolling.topNeed.confidence * 100)}%` : "-"
  });
}

function renderReviewCards() {
  const sample = state.featureBuffer[state.featureBuffer.length - 1] || currentFeatureSample(performance.now());
  const interpretation = sample.interpretation;
  els.reviewCards.innerHTML = "";
  els.reviewCards.append(reviewCard(
    `Affect: ${interpretation.affect.primary}`,
    `${Math.round(interpretation.affect.confidence * 100)}%`,
    [
      `valence ${interpretation.affect.valence}`,
      `arousal ${interpretation.affect.arousal}`,
      ...interpretation.affect.evidence.slice(0, 3)
    ]
  ));
  for (const need of interpretation.needs.slice(0, 5)) {
    els.reviewCards.append(reviewCard(
      titleCase(need.name),
      `${Math.round(need.confidence * 100)}%`,
      need.evidence
    ));
  }
}

function reviewCard(title, value, evidence) {
  const card = document.createElement("div");
  card.className = "review-card";

  const head = document.createElement("div");
  head.className = "review-card-head";
  const titleNode = document.createElement("span");
  titleNode.textContent = title;
  const valueNode = document.createElement("span");
  valueNode.textContent = value;
  head.append(titleNode, valueNode);

  const body = document.createElement("p");
  body.className = "review-card-evidence";
  body.textContent = evidence.filter(Boolean).slice(0, 4).join("; ") || "baseline only";

  card.append(head, body);
  return card;
}

function updateChildMode() {
  const enabled = els.childModeToggle.checked;
  els.viewer.classList.toggle("child-mode", enabled);
  els.childOverlay.hidden = !enabled;
  if (!enabled) return;

  const samples = childSummarySamples();
  renderChildEmotionCards(samples);
  renderChildNeedCards(samples);
}

function childSummarySamples(now = performance.now()) {
  const cutoff = now - childSummaryWindowMs();
  const freshSamples = state.featureBuffer.filter((sample) => sample.perfAt >= cutoff);
  return freshSamples.length ? freshSamples : [currentFeatureSample(now)];
}

function renderChildEmotionCards(samples) {
  renderChildSummaryList(els.childEmotionCards, summarizeChildEmotions(samples), "🙂", "Calm", 100);
}

function renderChildNeedCards(samples) {
  renderChildSummaryList(els.childNeedCards, summarizeChildNeeds(samples), "👀", "Watching", 100);
}

function summarizeChildEmotions(samples) {
  const total = Math.max(1, samples.length);
  const buckets = new Map();
  for (const sample of samples) {
    const emotion = childEmotionForAffect(sample.interpretation?.affect?.primary);
    addChildSummaryBucket(buckets, emotion.key, emotion.emoji, emotion.label, sample.interpretation?.affect?.confidence || 0);
  }
  return childSummaryItems(buckets, total);
}

function summarizeChildNeeds(samples) {
  const total = Math.max(1, samples.length);
  const buckets = new Map();
  for (const sample of samples) {
    const need = sample.interpretation?.needs?.[0] || null;
    if (!need) continue;
    addChildSummaryBucket(
      buckets,
      need.name,
      CHILD_NEED_EMOJIS[need.name] || "",
      titleCase(need.name),
      need.confidence || 0
    );
  }
  return childSummaryItems(buckets, total);
}

function childEmotionForAffect(primary) {
  return CHILD_AFFECT_BY_ALIAS.get(primary) || CHILD_AFFECT_BY_KEY.get(primary) || CHILD_AFFECT_BY_KEY.get("neutral");
}

function addChildSummaryBucket(buckets, key, emoji, label, confidence) {
  const bucket = buckets.get(key) || { key, emoji, label, count: 0, confidenceTotal: 0 };
  bucket.count += 1;
  bucket.confidenceTotal += confidence;
  buckets.set(key, bucket);
}

function childSummaryItems(buckets, total) {
  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      percent: Math.round((bucket.count / total) * 100),
      avgConfidence: bucket.count ? bucket.confidenceTotal / bucket.count : 0
    }))
    .sort((a, b) => b.count - a.count || b.avgConfidence - a.avgConfidence || a.label.localeCompare(b.label))
    .slice(0, CHILD_SUMMARY_LIMIT);
}

function renderChildSummaryList(node, items, fallbackEmoji, fallbackLabel, fallbackPercent) {
  node.innerHTML = "";
  const rows = items.length ? items : [{ emoji: fallbackEmoji, label: fallbackLabel, percent: fallbackPercent }];
  for (const [index, item] of rows.entries()) {
    node.append(childSummaryRow(item, index === 0));
  }
}

function childSummaryRow(item, active) {
  const row = document.createElement("div");
  row.className = "child-summary-row";
  row.dataset.active = String(active);
  row.style.setProperty("--share", `${Math.max(4, item.percent)}%`);

  const fill = document.createElement("span");
  fill.className = "child-summary-fill";
  fill.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "child-summary-label";

  const emoji = document.createElement("span");
  emoji.className = "child-summary-emoji";
  emoji.textContent = item.emoji;

  const text = document.createElement("span");
  text.textContent = item.label;
  label.append(emoji, text);

  const percent = document.createElement("span");
  percent.className = "child-summary-percent";
  percent.textContent = `${item.percent}%`;

  row.append(fill, label, percent);
  return row;
}

function renderDl(node, data) {
  node.innerHTML = "";
  for (const [key, value] of Object.entries(data)) {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = String(value);
    node.append(dt, dd);
  }
}

function measureFrameQuality() {
  const rect = visibleContentRect();
  if (!rect.width || !rect.height) return null;

  const sampleW = Math.max(1, Math.min(160, Math.floor(rect.width)));
  const sampleH = Math.max(1, Math.min(90, Math.floor(rect.height)));
  const x = Math.floor(rect.x + (rect.width - sampleW) / 2);
  const y = Math.floor(rect.y + (rect.height - sampleH) / 2);
  const data = ctx.getImageData(x, y, sampleW, sampleH).data;

  let lumaSum = 0;
  let edgeSum = 0;
  let previous = 0;
  const pixels = sampleW * sampleH;
  for (let i = 0; i < data.length; i += 4) {
    const luma = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    lumaSum += luma;
    edgeSum += Math.abs(luma - previous);
    previous = luma;
  }

  return {
    brightness: lumaSum / pixels,
    sharpness: edgeSum / pixels
  };
}

function measureAudioTelemetry(now) {
  const analyser = state.audioAnalyser;
  if (!analyser || !state.audioTimeData || !state.audioFreqData) return null;

  analyser.getFloatTimeDomainData(state.audioTimeData);
  analyser.getFloatFrequencyData(state.audioFreqData);

  let sumSquares = 0;
  let peak = 0;
  let crossings = 0;
  let previousSign = Math.sign(state.audioTimeData[0] || 0);
  for (const sample of state.audioTimeData) {
    const abs = Math.abs(sample);
    sumSquares += sample * sample;
    peak = Math.max(peak, abs);
    const sign = Math.sign(sample);
    if (sign && previousSign && sign !== previousSign) crossings += 1;
    if (sign) previousSign = sign;
  }

  const sampleCount = state.audioTimeData.length || 1;
  const rms = Math.sqrt(sumSquares / sampleCount);
  const zeroCrossingRate = sampleCount > 1 ? crossings / (sampleCount - 1) : 0;
  const sampleRate = state.audioContext?.sampleRate || null;
  const spectralCentroidHz = sampleRate ? spectralCentroid(state.audioFreqData, sampleRate) : null;
  const pitchHz = sampleRate ? estimatePitchHz(state.audioTimeData, sampleRate, rms) : null;
  const voiceActivity = rms > 0.015 || peak > 0.08;

  return {
    __typename: "AudioTelemetry",
    capturedAt: Math.round(now),
    rms,
    peak,
    zeroCrossingRate,
    spectralCentroidHz,
    pitchHz,
    voiceActivity,
    sampleRate,
    fftSize: analyser.fftSize
  };
}

function spectralCentroid(freqData, sampleRate) {
  let weighted = 0;
  let total = 0;
  for (let index = 0; index < freqData.length; index += 1) {
    const db = freqData[index];
    if (!Number.isFinite(db)) continue;
    const magnitude = Math.pow(10, db / 20);
    const frequency = index * sampleRate / (2 * freqData.length);
    weighted += frequency * magnitude;
    total += magnitude;
  }
  return total > 0 ? weighted / total : null;
}

function estimatePitchHz(samples, sampleRate, rms) {
  if (!sampleRate || rms < 0.012) return null;
  const minLag = Math.floor(sampleRate / 600);
  const maxLag = Math.min(Math.floor(sampleRate / 70), Math.floor(samples.length / 2));
  let bestLag = 0;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    for (let index = 0; index < samples.length - lag; index += 1) {
      correlation += samples[index] * samples[index + lag];
    }
    correlation /= samples.length - lag;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  return bestLag && bestCorrelation > 0.00018 ? sampleRate / bestLag : null;
}

function eyeOpenness(points) {
  const left = ratioDistance(points[159], points[145], points[33], points[133]);
  const right = ratioDistance(points[386], points[374], points[362], points[263]);
  return (left + right) / 2;
}

function isBlink(points) {
  return eyeOpenness(points) < 0.18;
}

function mouthOpenness(points) {
  return ratioDistance(points[13], points[14], points[61], points[291]);
}

function handOpenness(points) {
  if (!points[0]) return 0;
  const tips = [4, 8, 12, 16, 20].map((index) => points[index]).filter(Boolean);
  if (tips.length === 0) return 0;
  const palm = distance(points[0], points[9]) || 1;
  const spread = tips.reduce((sum, point) => sum + distance(points[0], point), 0) / tips.length;
  return spread / palm;
}

function handPinch(points) {
  const palm = distance(points[0], points[9]) || 1;
  return distance(points[4], points[8]) / palm;
}

function bufferWindowSeconds() {
  return clampInt(els.bufferSecondsInput.value, 10, 120, 45);
}

function bufferWindowMs() {
  return bufferWindowSeconds() * 1000;
}

function childSummaryWindowSeconds() {
  return clampInt(els.childSummarySecondsInput.value, 5, 60, 30);
}

function childSummaryWindowMs() {
  return childSummaryWindowSeconds() * 1000;
}

function poseFromMatrix(matrixData) {
  const matrix = matrixData?.data || matrixData;
  if (!matrix || matrix.length < 16) return null;
  const sy = Math.sqrt(matrix[0] * matrix[0] + matrix[4] * matrix[4]);
  const singular = sy < 1e-6;
  const pitch = singular ? Math.atan2(-matrix[6], matrix[5]) : Math.atan2(matrix[9], matrix[10]);
  const yaw = Math.atan2(-matrix[8], sy);
  const roll = singular ? 0 : Math.atan2(matrix[4], matrix[0]);
  return {
    pitch: radiansToDegrees(pitch),
    yaw: radiansToDegrees(yaw),
    roll: radiansToDegrees(roll)
  };
}

function topBlendshapes(blendshape) {
  const categories = blendshape?.categories || [];
  return categories
    .filter((item) => item.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => ({ name: item.categoryName, score: item.score }));
}

function blendshapeScoreMap(blendshape) {
  const scores = {};
  for (const item of blendshape?.categories || []) {
    scores[item.categoryName] = item.score;
  }
  return scores;
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }
}

function toCanvasPoint(point, width, height) {
  return { x: point.x * width, y: point.y * height };
}

function getRenderLayout(width, height) {
  const source = rotatedSourceSize();
  const frameRect = frameRectForAspect(width, height, source.aspect);
  const contentRect = contentRectForFit(frameRect, source.aspect);
  return { frameRect, contentRect, source };
}

function drawVideoIntoRect(rect) {
  const rotation = rotationDegrees();
  const rotated = rotation === 90 || rotation === 270;
  const drawWidth = rotated ? rect.height : rect.width;
  const drawHeight = rotated ? rect.width : rect.height;

  ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  if (els.mirrorToggle.checked) ctx.scale(-1, 1);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.drawImage(els.video, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
}

function frameRectForAspect(width, height, sourceAspect) {
  const aspect = selectedAspectRatio(sourceAspect || width / height);
  if (!aspect) return { x: 0, y: 0, width, height };
  return centeredAspectRect({ x: 0, y: 0, width, height }, aspect, "contain");
}

function contentRectForFit(frameRect, sourceAspect) {
  const fit = els.fitSelect.value;
  if (fit === "stretch" || !sourceAspect) return { ...frameRect };
  return centeredAspectRect(frameRect, sourceAspect, fit);
}

function centeredAspectRect(container, aspect, mode) {
  const containerAspect = container.width / container.height;
  const useWidth = mode === "cover" ? containerAspect > aspect : containerAspect < aspect;
  const width = useWidth ? container.width : container.height * aspect;
  const height = useWidth ? container.width / aspect : container.height;
  return {
    x: container.x + (container.width - width) / 2,
    y: container.y + (container.height - height) / 2,
    width,
    height
  };
}

function rotatedSourceSize() {
  const videoWidth = els.video.videoWidth || state.settings.width || Number(els.widthInput.value) || 1280;
  const videoHeight = els.video.videoHeight || state.settings.height || Number(els.heightInput.value) || 720;
  const rotated = rotationDegrees() === 90 || rotationDegrees() === 270;
  const width = rotated ? videoHeight : videoWidth;
  const height = rotated ? videoWidth : videoHeight;
  return { width, height, aspect: width / height };
}

function selectedAspectRatio(sourceAspect) {
  const value = els.aspectSelect.value;
  if (value === "viewport") return null;
  if (value === "source") return sourceAspect;
  const [w, h] = value.split(":").map(Number);
  return w > 0 && h > 0 ? w / h : null;
}

function visibleContentRect() {
  const layout = state.renderLayout || getRenderLayout(els.canvas.width, els.canvas.height);
  return intersectRect(layout.contentRect, { x: 0, y: 0, width: els.canvas.width, height: els.canvas.height });
}

function intersectRect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function clipRect(rect) {
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
}

function rotationDegrees() {
  return Number(els.rotationSelect.value) || 0;
}

function outputLabel() {
  const layout = state.renderLayout;
  if (!layout) return "-";
  return `${Math.round(layout.frameRect.width)} x ${Math.round(layout.frameRect.height)}`;
}

function updateButtons() {
  els.startButton.disabled = Boolean(state.stream);
  els.stopButton.disabled = !state.stream;
  els.snapshotButton.disabled = !state.stream;
  els.recordButton.disabled = !state.stream;
  els.scanButton.disabled = !state.stream;
  els.exportLabelsButton.disabled = state.labels.length === 0;
  els.clearLabelsButton.disabled = state.labels.length === 0;
  els.recordButton.textContent = state.isRecording ? "Stop rec" : "Record";
}

function updateFaceLoader() {
  if (!els.faceLoadBadge || !els.faceLoadText) return;
  const visible = els.metricsToggle.checked && (state.faceLoading || state.faceReady || state.faceError);
  els.faceLoadBadge.hidden = !visible;
  if (!visible) return;

  const mode = state.faceLoading ? "loading" : state.faceError ? "error" : "ready";
  els.faceLoadBadge.dataset.state = mode;
  els.faceLoadText.textContent = mode === "loading"
    ? "Loading face telemetry"
    : mode === "error"
      ? `Face telemetry error: ${state.faceError}`
      : `Face telemetry ready: ${state.faceDelegate || "ready"}`;
}

function updateHandLoader() {
  if (!els.handLoadBadge || !els.handLoadText) return;
  const visible = els.handTelemetryToggle.checked && (state.handLoading || state.handReady || state.handError);
  els.handLoadBadge.hidden = !visible;
  if (!visible) return;

  const mode = state.handLoading ? "loading" : state.handError ? "error" : "ready";
  els.handLoadBadge.dataset.state = mode;
  els.handLoadText.textContent = mode === "loading"
    ? "Loading hand telemetry"
    : mode === "error"
      ? `Hand telemetry error: ${state.handError}`
      : `Hand telemetry ready: ${state.handDelegate || "ready"}`;
}

function updateBodyLoader() {
  if (!els.bodyLoadBadge || !els.bodyLoadText) return;
  const visible = els.bodyTelemetryToggle.checked && (state.bodyLoading || state.bodyReady || state.bodyError);
  els.bodyLoadBadge.hidden = !visible;
  if (!visible) return;

  const mode = state.bodyLoading ? "loading" : state.bodyError ? "error" : "ready";
  els.bodyLoadBadge.dataset.state = mode;
  els.bodyLoadText.textContent = mode === "loading"
    ? "Loading body telemetry"
    : mode === "error"
      ? `Body telemetry error: ${state.bodyError}`
      : `Body telemetry ready: ${state.bodyDelegate || "ready"}`;
}

function updateAudioLoader() {
  if (!els.audioLoadBadge || !els.audioLoadText) return;
  const visible = els.audioTelemetryToggle.checked && (state.audioLoading || state.audioReady || state.audioError);
  els.audioLoadBadge.hidden = !visible;
  if (!visible) return;

  const mode = state.audioLoading ? "loading" : state.audioError ? "error" : "ready";
  els.audioLoadBadge.dataset.state = mode;
  els.audioLoadText.textContent = mode === "loading"
    ? "Loading audio telemetry"
    : mode === "error"
      ? `Audio telemetry error: ${state.audioError}`
      : "Audio telemetry ready";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setStatus(message) {
  els.status.textContent = message;
}

function streamingStatusText() {
  const parts = ["Streaming"];
  if (els.metricsToggle.checked) {
    if (state.faceReady) parts.push(`face ${state.faceDelegate || "ready"}`);
    else if (state.faceError) parts.push(`face error: ${state.faceError}`);
    else if (state.faceLoading) parts.push("face loading");
    else parts.push("face not loaded");
  }
  if (els.handTelemetryToggle.checked) {
    if (state.handReady) parts.push(`hands ${state.handDelegate || "ready"}`);
    else if (state.handError) parts.push(`hands error: ${state.handError}`);
    else if (state.handLoading) parts.push("hands loading");
    else parts.push("hands not loaded");
  }
  if (els.bodyTelemetryToggle.checked) {
    if (state.bodyReady) parts.push(`body ${state.bodyDelegate || "ready"}`);
    else if (state.bodyError) parts.push(`body error: ${state.bodyError}`);
    else if (state.bodyLoading) parts.push("body loading");
    else parts.push("body not loaded");
  }
  if (els.audioTelemetryToggle.checked) {
    parts.push(`audio ${audioStatusText()}`);
  }
  return parts.join("; ");
}

function audioStatusText() {
  if (!els.audioTelemetryToggle.checked) return "off";
  if (state.audioLoading) return "loading";
  if (state.audioError) return `error: ${state.audioError}`;
  if (state.audioReady) return state.latestAudio?.voiceActivity ? "voice" : "ready";
  return "not loaded";
}

function cameraErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "Camera access was blocked.";
  }
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") return "No camera was found.";
  if (error?.name === "NotReadableError") return "Camera is already in use by another app.";
  if (error?.name === "OverconstrainedError") return `Camera constraint failed: ${error.constraint || "unknown"}`;
  return `Could not start the camera: ${error?.name || "error"}`;
}

function audioErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "Microphone access was blocked.";
  }
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") return "No microphone was found.";
  if (error?.name === "NotReadableError") return "Microphone is already in use by another app.";
  return errorMessage(error);
}

function errorMessage(error) {
  return error?.message || error?.name || String(error || "error");
}

function canvasScale() {
  return Math.max(1, Math.min(2, window.devicePixelRatio || 1));
}
