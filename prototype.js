import {
  FilesetResolver,
  HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const controls = document.querySelectorAll(".control-button");
const gestureLabel = document.getElementById("gestureLabel");
const gestureNarrative = document.getElementById("gestureNarrative");
const sliceCounter = document.getElementById("sliceCounter");
const scanFrame = document.getElementById("scanFrame");
const zoomBadge = document.getElementById("zoomBadge");
const delayMetric = document.getElementById("delayMetric");
const responseMetric = document.getElementById("responseMetric");
const cvStatus = document.getElementById("cvStatus");
const cvNarrative = document.getElementById("cvNarrative");
const latencyBadge = document.getElementById("latencyBadge");
const cameraToggle = document.getElementById("cameraToggle");
const cameraFeed = document.getElementById("cameraFeed");
const handOverlay = document.getElementById("handOverlay");

const overlayContext = handOverlay.getContext("2d");

let currentSlice = 12;
let zoomLevel = 1;
let paused = false;
let handLandmarker = null;
let cameraStream = null;
let animationFrameId = null;
let lastVideoTime = -1;
let trackingEnabled = false;
let swipeCooldownUntil = 0;
let pauseCooldownUntil = 0;
let lastPalmX = null;
let smoothedPinch = null;
let lastAction = "Idle";

const colors = {
  stroke: "#3ce3b6",
  joint: "#fefefe"
};

const now = () => performance.now();

const setCvState = (status, narrative) => {
  cvStatus.textContent = status;
  cvNarrative.textContent = narrative;
};

const setActiveButton = (action) => {
  controls.forEach((button) => {
    button.classList.toggle("active", button.dataset.action === action);
  });
};

const updateView = (gesture, narrative) => {
  gestureLabel.textContent = gesture;
  gestureNarrative.textContent = narrative;
  sliceCounter.textContent = `Slice ${currentSlice} / 24`;
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
    currentSlice = Math.min(24, currentSlice + 1);
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

  if (actionName === lastAction && actionName !== "pause") {
    return;
  }

  lastAction = actionName;
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

const isOpenPalm = (landmarks, handedness) => {
  const thumb = isThumbExtended(landmarks[4], landmarks[3], landmarks[2], handedness);
  const index = isFingerExtended(landmarks[8], landmarks[6], landmarks[5]);
  const middle = isFingerExtended(landmarks[12], landmarks[10], landmarks[9]);
  const ring = isFingerExtended(landmarks[16], landmarks[14], landmarks[13]);
  const pinky = isFingerExtended(landmarks[20], landmarks[18], landmarks[17]);
  return thumb && index && middle && ring && pinky;
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

const handleLandmarks = (landmarks, handednessLabel) => {
  const currentTime = now();
  const palmCenterX = (landmarks[0].x + landmarks[9].x) / 2;
  const pinchDistance = landmarkDistance(landmarks[4], landmarks[8]);
  const palmOpen = isOpenPalm(landmarks, handednessLabel);

  drawHand(landmarks);

  if (palmOpen && currentTime > pauseCooldownUntil) {
    pauseCooldownUntil = currentTime + 1600;
    invokeAction("pause");
    lastPalmX = palmCenterX;
    smoothedPinch = pinchDistance;
    return;
  }

  if (paused) {
    lastPalmX = palmCenterX;
    smoothedPinch = pinchDistance;
    return;
  }

  if (lastPalmX !== null) {
    const deltaX = palmCenterX - lastPalmX;
    if (currentTime > swipeCooldownUntil && Math.abs(deltaX) > 0.12) {
      swipeCooldownUntil = currentTime + 900;
      invokeAction(deltaX > 0 ? "next" : "prev");
    }
  }

  if (smoothedPinch !== null) {
    const pinchDelta = pinchDistance - smoothedPinch;
    if (Math.abs(pinchDelta) > 0.012) {
      invokeAction(pinchDelta < 0 ? "zoomIn" : "zoomOut");
    }
  }

  lastPalmX = palmCenterX;
  smoothedPinch = smoothedPinch === null ? pinchDistance : (smoothedPinch * 0.8) + (pinchDistance * 0.2);
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
      lastPalmX = null;
      smoothedPinch = null;
      setCvState("Searching", "No hand found. Hold one hand in front of the camera with good lighting.");
      latencyBadge.textContent = "Latency: live";
    }
  }

  animationFrameId = requestAnimationFrame(detectFrame);
};

const stopTracking = () => {
  trackingEnabled = false;
  cameraToggle.textContent = "Start Camera Tracking";
  setCvState("Camera offline", "Enable webcam access to detect hand gestures in the browser.");
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

  cameraFeed.srcObject = null;
  lastPalmX = null;
  smoothedPinch = null;
  lastVideoTime = -1;
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
    cameraToggle.textContent = "Stop Camera Tracking";
    setCvState("Camera live", "Hand tracker ready. Use swipe, pinch, or open palm gestures.");
    detectFrame();
  } catch (error) {
    console.error(error);
    setCvState(
      "Tracking unavailable",
      "Camera access or model loading failed. The manual gesture buttons remain available."
    );
  } finally {
    cameraToggle.disabled = false;
  }
};

cameraToggle.addEventListener("click", startTracking);

window.addEventListener("resize", syncCanvasSize);
window.addEventListener("beforeunload", stopTracking);

updateView("Idle", "System waiting for surgeon hand movement.");
