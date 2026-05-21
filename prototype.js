import {
  FilesetResolver,
  HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const controls = document.querySelectorAll(".control-button");
const gestureLabel = document.getElementById("gestureLabel");
const gestureNarrative = document.getElementById("gestureNarrative");
const sliceCounter = document.getElementById("sliceCounter");
const scanFrame = document.getElementById("scanFrame");
const ctSliceImage = document.getElementById("ctSliceImage");
const zoomBadge = document.getElementById("zoomBadge");
const delayMetric = document.getElementById("delayMetric");
const responseMetric = document.getElementById("responseMetric");
const cvStatus = document.getElementById("cvStatus");
const cvNarrative = document.getElementById("cvNarrative");
const cvAlert = document.getElementById("cvAlert");
const latencyBadge = document.getElementById("latencyBadge");
const debugReadout = document.getElementById("debugReadout");
const cameraToggle = document.getElementById("cameraToggle");
const cameraFeed = document.getElementById("cameraFeed");
const handOverlay = document.getElementById("handOverlay");

const overlayContext = handOverlay.getContext("2d");
const brightnessProbe = document.createElement("canvas");
const brightnessContext = brightnessProbe.getContext("2d", { willReadFrequently: true });

let currentSlice = 12;
let smoothedNavX = null;
let zoomLevel = 1;
let paused = false;
let handLandmarker = null;
let cameraStream = null;
let animationFrameId = null;
let lastVideoTime = -1;
let trackingEnabled = false;
let pauseCooldownUntil = 0;
let smoothedPinch = null;
let availableCtSlices = [];
let lastPinchDistance = null;
let handPresenceFrames = 0;
let pinchEngaged = false;
let navZoneState = "center";
let missingHandFrames = 0;
let recalibrating = false;
let trackingReadyAt = 0;
let palmOpenSince = 0;
let pinchClosedFrames = 0;
let zoneHoldFrames = 0;
let zoneCandidate = "center";

const defaultCtSliceCandidates = Array.from({ length: 24 }, (_, index) => {
  const sliceNumber = String(index + 1).padStart(2, "0");
  return [
    `./ct-slices/slice-${sliceNumber}.png`,
    `./ct-slices/slice-${sliceNumber}.jpg`,
    `./ct-slices/slice-${sliceNumber}.jpeg`
  ];
});

const colors = {
  stroke: "#3ce3b6",
  joint: "#fefefe"
};

const now = () => performance.now();

const getSliceCount = () => availableCtSlices.length || 24;
const GESTURE_WARMUP_MS = 900;
const MIN_STABLE_FRAMES = 6;
const PAUSE_HOLD_MS = 450;
const PINCH_HOLD_FRAMES = 3;
const SWIPE_HOLD_FRAMES = 3;

const setCvState = (status, narrative) => {
  cvStatus.textContent = status;
  cvNarrative.textContent = narrative;
};

const setCvAlert = (message, tone = "idle") => {
  cvAlert.textContent = message;
  cvAlert.className = `cv-alert cv-alert-${tone}`;
};

const setDebugReadout = (message) => {
  debugReadout.textContent = message;
};

const setActiveButton = (action) => {
  controls.forEach((button) => {
    button.classList.toggle("active", button.dataset.action === action);
  });
};

const updateView = (gesture, narrative) => {
  const totalSlices = getSliceCount();
  gestureLabel.textContent = gesture;
  gestureNarrative.textContent = narrative;
  sliceCounter.textContent = `Slice ${currentSlice} / ${totalSlices}`;
  zoomBadge.textContent = `${zoomLevel.toFixed(1)}x`;
  delayMetric.textContent = paused ? "Workflow paused" : "3-7 min baseline";
  responseMetric.textContent = paused ? "Gesture lock engaged" : "Immediate image update";

  const sliceIntensity = 0.15 + currentSlice / 40;
  scanFrame.style.background = `
    linear-gradient(180deg, rgba(255, 255, 255, ${0.06 + sliceIntensity / 4}), rgba(255, 255, 255, 0.02)),
    radial-gradient(circle, rgba(182, 239, 230, ${sliceIntensity}), transparent 48%)
  `;
  scanFrame.style.filter = paused ? "saturate(0.65)" : "saturate(1)";
  scanFrame.style.transform = `scale(${zoomLevel})`;

  if (availableCtSlices.length > 0) {
    const sliceIndex = clamp(currentSlice - 1, 0, availableCtSlices.length - 1);
    ctSliceImage.src = availableCtSlices[sliceIndex];
    scanFrame.classList.add("has-real-scan");
  } else {
    scanFrame.classList.remove("has-real-scan");
  }
};

const actions = {
  prev: () => {
    paused = false;
    currentSlice = Math.max(1, currentSlice - 1);
    setActiveButton("prev");
    updateView("Swipe Left", "Moved to the previous CT slice without scrub nurse relay.");
  },
  next: () => {
    paused = false;
    currentSlice = Math.min(getSliceCount(), currentSlice + 1);
    setActiveButton("next");
    updateView("Swipe Right", "Advanced to the next CT slice in the sterile field.");
  },
  zoomIn: () => {
    paused = false;
    zoomLevel = Math.min(1.8, zoomLevel + 0.08);
    setActiveButton("zoom");
    updateView("Pinch To Zoom", "Magnified the current slice for closer review of anatomy.");
  },
  zoomOut: () => {
    paused = false;
    zoomLevel = Math.max(0.8, zoomLevel - 0.08);
    setActiveButton("zoom");
    updateView("Release Pinch", "Reduced magnification to restore the broader field of view.");
  },
  pause: () => {
    paused = !paused;
    setActiveButton("pause");
    updateView("Open Palm Pause", paused ? "Gesture input is paused to prevent accidental movement." : "Gesture input resumed.");
  }
};

const invokeAction = (actionName) => {
  if (typeof actions[actionName] !== "function") {
    return;
  }
  actions[actionName]();
};

controls.forEach((control) => {
  control.addEventListener("click", () => {
    const actionMap = {
      prev: "prev",
      next: "next",
      zoom: "zoomIn",
      pause: "pause"
    };
    invokeAction(actionMap[control.dataset.action]);
  });
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const applyContinuousZoom = (pinchVelocity) => {
  const zoomSensitivity = 2.4;
  const zoomDeadZone = 0.004;
  const zoomDelta = pinchVelocity * zoomSensitivity;

  if (Math.abs(zoomDelta) < zoomDeadZone) {
    return false;
  }

  const nextZoom = clamp(zoomLevel + zoomDelta, 0.8, 1.8);
  if (Math.abs(nextZoom - zoomLevel) < 0.002) {
    return false;
  }

  paused = false;
  zoomLevel = nextZoom;
  setActiveButton("zoom");
  updateView(
    zoomDelta > 0 ? "Pinch To Zoom" : "Release Pinch",
    zoomDelta > 0
      ? "Magnified the current slice for closer review of anatomy."
      : "Reduced magnification to restore the broader field of view."
  );
  return true;
};

const landmarkDistance = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
};

const isFingerExtended = (tip, pip, mcp) => tip.y < pip.y && pip.y < mcp.y;

const isThumbExtended = (thumbTip, thumbIp, thumbMcp, handedness) => {
  if (handedness === "Left") {
    return thumbTip.x > thumbIp.x && thumbIp.x > thumbMcp.x;
  }
  return thumbTip.x < thumbIp.x && thumbIp.x < thumbMcp.x;
};

const countExtendedFingers = (landmarks, handedness) => {
  const thumb = isThumbExtended(landmarks[4], landmarks[3], landmarks[2], handedness) ? 1 : 0;
  const index = isFingerExtended(landmarks[8], landmarks[6], landmarks[5]);
  const middle = isFingerExtended(landmarks[12], landmarks[10], landmarks[9]);
  const ring = isFingerExtended(landmarks[16], landmarks[14], landmarks[13]);
  const pinky = isFingerExtended(landmarks[20], landmarks[18], landmarks[17]);
  return thumb + Number(index) + Number(middle) + Number(ring) + Number(pinky);
};

const isOpenPalm = (landmarks, handedness) => {
  return countExtendedFingers(landmarks, handedness) >= 4;
};

const drawHand = (landmarks) => {
  const width = handOverlay.width;
  const height = handOverlay.height;
  const connectors = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17]
  ];

  overlayContext.clearRect(0, 0, width, height);
  overlayContext.lineWidth = 3;
  overlayContext.strokeStyle = colors.stroke;
  overlayContext.fillStyle = colors.joint;

  connectors.forEach(([start, end]) => {
    overlayContext.beginPath();
    overlayContext.moveTo(landmarks[start].x * width, landmarks[start].y * height);
    overlayContext.lineTo(landmarks[end].x * width, landmarks[end].y * height);
    overlayContext.stroke();
  });

  landmarks.forEach((point) => {
    overlayContext.beginPath();
    overlayContext.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2);
    overlayContext.fill();
  });
};

const clearOverlay = () => {
  overlayContext.clearRect(0, 0, handOverlay.width, handOverlay.height);
};

const syncCanvasSize = () => {
  const rect = cameraFeed.getBoundingClientRect();
  handOverlay.width = Math.max(1, Math.floor(rect.width));
  handOverlay.height = Math.max(1, Math.floor(rect.height));
};

const measureBrightness = () => {
  if (!cameraFeed.videoWidth || !cameraFeed.videoHeight) {
    return null;
  }

  const sampleWidth = 32;
  const sampleHeight = 24;
  brightnessProbe.width = sampleWidth;
  brightnessProbe.height = sampleHeight;
  brightnessContext.drawImage(cameraFeed, 0, 0, sampleWidth, sampleHeight);
  const { data } = brightnessContext.getImageData(0, 0, sampleWidth, sampleHeight);

  let total = 0;
  for (let index = 0; index < data.length; index += 4) {
    total += (data[index] + data[index + 1] + data[index + 2]) / 3;
  }

  return total / (data.length / 4);
};

const handleLandmarks = (landmarks, handednessLabel) => {
  const currentTime = now();
  const indexTipX = landmarks[8].x;
  const pinchDistance = landmarkDistance(landmarks[4], landmarks[8]);
  const extendedFingerCount = countExtendedFingers(landmarks, handednessLabel);
  const palmOpen = extendedFingerCount >= 4;
  const wristToMiddleMcp = landmarkDistance(landmarks[0], landmarks[9]);
  const normalizedPinch = pinchDistance / Math.max(wristToMiddleMcp, 0.001);
  const brightness = measureBrightness();
  let gestureRecognized = false;

  drawHand(landmarks);
  handPresenceFrames += 1;
  missingHandFrames = 0;
  recalibrating = false;

  if (currentTime < trackingReadyAt || handPresenceFrames < MIN_STABLE_FRAMES) {
    pinchEngaged = false;
    pinchClosedFrames = 0;
    lastPinchDistance = null;
    navZoneState = "center";
    zoneCandidate = "center";
    zoneHoldFrames = 0;
    setCvState("Analyzing hand", "Hold your hand steady while the model calibrates motion.");
    setCvAlert("🔄 Recalibrating...", "info");
    setDebugReadout(`calibrating | frames=${handPresenceFrames} | pinch=${normalizedPinch.toFixed(2)}`);
    return;
  }

  if (palmOpen) {
    if (palmOpenSince === 0) {
      palmOpenSince = currentTime;
    }
  } else {
    palmOpenSince = 0;
  }

  if (palmOpenSince !== 0 && currentTime - palmOpenSince >= PAUSE_HOLD_MS && currentTime > pauseCooldownUntil) {
    pauseCooldownUntil = currentTime + 1600;
    invokeAction("pause");
    smoothedPinch = normalizedPinch;
    lastPinchDistance = null;
    pinchEngaged = false;
    pinchClosedFrames = 0;
    palmOpenSince = 0;
    navZoneState = "center";
    zoneCandidate = "center";
    zoneHoldFrames = 0;
    gestureRecognized = true;
    setDebugReadout(`pause gesture | fingers=${extendedFingerCount} | pinch=${normalizedPinch.toFixed(2)}`);
    setCvAlert("🔄 Recalibrating...", "info");
    return;
  }

  if (paused) {
    smoothedPinch = normalizedPinch;
    lastPinchDistance = null;
    pinchEngaged = false;
    pinchClosedFrames = 0;
    navZoneState = "center";
    zoneCandidate = "center";
    zoneHoldFrames = 0;
    setDebugReadout(`paused | fingers=${extendedFingerCount} | pinch=${normalizedPinch.toFixed(2)}`);
    setCvAlert("🔄 Recalibrating...", "info");
    return;
  }

  const pinchClosed = normalizedPinch < 0.58;
  const pinchReleased = normalizedPinch > 0.72;

  if (pinchClosed && extendedFingerCount <= 3) {
    pinchClosedFrames += 1;
  } else {
    pinchClosedFrames = 0;
  }

  if (pinchClosedFrames >= PINCH_HOLD_FRAMES) {
    pinchEngaged = true;
  } else if (pinchReleased) {
    pinchEngaged = false;
    lastPinchDistance = null;
    pinchClosedFrames = 0;
  }

const displayIndexTipX = 1 - indexTipX;

// smoothing (stabilizes jitter)
smoothedNavX = smoothedNavX === null
  ? displayIndexTipX
  : (smoothedNavX * 0.78) + (displayIndexTipX * 0.22);

// zone detection based on smoothed motion
const currentZone =
  smoothedNavX < 0.3 ? "left" :
  smoothedNavX > 0.7 ? "right" :
  "center";

  if (!pinchEngaged) {
    if (currentZone !== "center") {
      if (zoneCandidate === currentZone) {
        zoneHoldFrames += 1;
      } else {
        zoneCandidate = currentZone;
        zoneHoldFrames = 1;
      }
    } else {
      zoneCandidate = "center";
      zoneHoldFrames = 0;
    }

    if (currentZone === "left" && navZoneState !== "left" && zoneHoldFrames >= SWIPE_HOLD_FRAMES) {
      navZoneState = "left";
      invokeAction("prev");
      gestureRecognized = true;
setDebugReadout(`left zone trigger | screenX=${smoothedNavX.toFixed(3)} | fingers=${extendedFingerCount}`);      setCvAlert("Gesture recognized", "info");
      return;
    }

    if (currentZone === "right" && navZoneState !== "right" && zoneHoldFrames >= SWIPE_HOLD_FRAMES) {
      navZoneState = "right";
      invokeAction("next");
      gestureRecognized = true;
setDebugReadout(`right zone trigger | screenX=${smoothedNavX.toFixed(3)} | fingers=${extendedFingerCount}`);      setCvAlert("Gesture recognized", "info");
      return;
    }

    if (currentZone === "center") {
      navZoneState = "center";
    }
  }

  if (pinchEngaged && smoothedPinch !== null) {
    smoothedPinch = (smoothedPinch * 0.82) + (normalizedPinch * 0.18);
    if (lastPinchDistance !== null) {
      const pinchVelocity = lastPinchDistance - smoothedPinch;
      if (applyContinuousZoom(pinchVelocity)) {
        gestureRecognized = true;
        setDebugReadout(`pinch zoom | velocity=${pinchVelocity.toFixed(3)} | fingers=${extendedFingerCount}`);
        setCvAlert("Gesture recognized", "info");
        lastPinchDistance = smoothedPinch;
        return;
      }
    }
    lastPinchDistance = smoothedPinch;
  } else {
    smoothedPinch = normalizedPinch;
    lastPinchDistance = null;
  }

  if (brightness !== null && brightness < 55) {
    setCvAlert("⚠️ Low lighting detected", "warning");
  } else if (!gestureRecognized && handPresenceFrames > 12) {
    setCvAlert("❌ Gesture not recognized", "error");
  } else if (recalibrating) {
    setCvAlert("🔄 Recalibrating...", "info");
  } else {
    setCvAlert("Hand detected", "idle");
  }

  setDebugReadout(
`tracking | zone=${currentZone} | screenX=${smoothedNavX.toFixed(3)} | pinch=${normalizedPinch.toFixed(2)} | fingers=${extendedFingerCount} | light=${brightness === null ? "na" : brightness.toFixed(0)} | pinchMode=${pinchEngaged ? "on" : "off"}`  );
};

const detectFrame = () => {
  if (!trackingEnabled || !handLandmarker || cameraFeed.readyState < 2) {
    return;
  }

  if (cameraFeed.videoWidth && cameraFeed.videoHeight) {
    syncCanvasSize();
  }

  if (cameraFeed.currentTime !== lastVideoTime) {
    const start = performance.now();
    const result = handLandmarker.detectForVideo(cameraFeed, start);
    const duration = Math.round(performance.now() - start);
    latencyBadge.textContent = `Latency: ${duration} ms`;
    lastVideoTime = cameraFeed.currentTime;

    if (result.landmarks.length > 0) {
      const handednessLabel = result.handednesses[0]?.[0]?.categoryName || "Right";
      setCvState("Tracking hand", `Detected ${handednessLabel.toLowerCase()} hand. Swipe or pinch to control the scan.`);
      handleLandmarks(result.landmarks[0], handednessLabel);
    } else {
      clearOverlay();
      smoothedNavX = null;
      handPresenceFrames = 0;
      missingHandFrames += 1;
      smoothedPinch = null;
      lastPinchDistance = null;
      pinchEngaged = false;
      pinchClosedFrames = 0;
      palmOpenSince = 0;
      navZoneState = "center";
      zoneCandidate = "center";
      zoneHoldFrames = 0;
      recalibrating = missingHandFrames > 18;
      trackingReadyAt = now() + GESTURE_WARMUP_MS;
      setCvState(
        recalibrating ? "Recalibrating" : "Searching",
        recalibrating
          ? "Reacquiring landmarks after tracking loss."
          : "No hand found. Hold one hand in front of the camera with good lighting."
      );
      setCvAlert(recalibrating ? "🔄 Recalibrating..." : "❌ Gesture not recognized", recalibrating ? "info" : "error");
      setDebugReadout("No hand detected.");
      latencyBadge.textContent = "Latency: live";
    }
  }

  animationFrameId = requestAnimationFrame(detectFrame);
};

const fileExists = (url) =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });

const discoverCtSlices = async () => {
  const discovered = [];

  for (const candidates of defaultCtSliceCandidates) {
    let found = null;
    for (const candidate of candidates) {
      if (await fileExists(candidate)) {
        found = candidate;
        break;
      }
    }

    if (!found) {
      break;
    }

    discovered.push(found);
  }

  availableCtSlices = discovered;
  if (availableCtSlices.length > 0) {
    currentSlice = 1;
  } else {
    currentSlice = Math.min(Math.max(1, currentSlice), getSliceCount());
  }
};

const stopTracking = () => {
  trackingEnabled = false;
  cameraToggle.textContent = "Start Camera Tracking";
  setCvState("Camera offline", "Enable webcam access to detect hand gestures in the browser.");
  setCvAlert("System idle", "idle");
  latencyBadge.textContent = "Latency: -- ms";
  clearOverlay();

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  smoothedNavX = null;
  cameraFeed.srcObject = null;
  smoothedPinch = null;
  handPresenceFrames = 0;
  lastPinchDistance = null;
  pinchEngaged = false;
  pinchClosedFrames = 0;
  palmOpenSince = 0;
  navZoneState = "center";
  zoneCandidate = "center";
  zoneHoldFrames = 0;
  missingHandFrames = 0;
  recalibrating = false;
  trackingReadyAt = 0;
  lastVideoTime = -1;
  setDebugReadout("Tracking stopped.");
};

const loadHandLandmarker = async () => {
  if (handLandmarker) {
    return handLandmarker;
  }

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
    },
    runningMode: "VIDEO",
    numHands: 1
  });

  return handLandmarker;
};

const startTracking = async () => {
  if (trackingEnabled) {
    stopTracking();
    smoothedNavX = null;
    return;
  }

  try {
    cameraToggle.disabled = true;
    setCvState("Loading model", "Preparing browser-side hand tracking.");
    await loadHandLandmarker();

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 960 },
        height: { ideal: 720 },
        facingMode: "user"
      },
      audio: false
    });

    cameraFeed.srcObject = cameraStream;
    await cameraFeed.play();
    trackingEnabled = true;
    trackingReadyAt = now() + GESTURE_WARMUP_MS;
    cameraToggle.textContent = "Stop Camera Tracking";
    setCvState("Analyzing hand", "Camera live. Hold your hand steady for a moment before gesturing.");
    setCvAlert("Camera live", "info");
    detectFrame();
  } catch (error) {
    console.error(error);
    setCvState(
      "Tracking unavailable",
      "Camera access or model loading failed. The manual gesture buttons remain available."
    );
    setCvAlert("❌ Gesture not recognized", "error");
  } finally {
    cameraToggle.disabled = false;
  }
};

cameraToggle.addEventListener("click", startTracking);

window.addEventListener("resize", syncCanvasSize);
window.addEventListener("beforeunload", stopTracking);

await discoverCtSlices();
updateView("Idle", "System waiting for surgeon hand movement.");
