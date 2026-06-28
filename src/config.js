export const MEDIAPIPE_VERSION = "0.10.35";
export const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
export const HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
export const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

export const STORAGE_KEY = "camera-control-app:settings:v1";
export const LABELS_STORAGE_KEY = "camera-control-app:labels:v1";
export const SETTINGS_VERSION = 4;

export const FACE_DETECT_INTERVAL_MS = 40;
export const FACE_HOLD_MS = 1600;
export const HAND_DETECT_INTERVAL_MS = 66;
export const HAND_HOLD_MS = 900;
export const BODY_DETECT_INTERVAL_MS = 66;
export const BODY_HOLD_MS = 1200;
export const AUDIO_ANALYSIS_INTERVAL_MS = 100;
export const FEATURE_SAMPLE_INTERVAL_MS = 1000;
export const MAX_LABEL_EVENTS = 80;

export const EYE_LANDMARK_INDICES = [33, 133, 159, 145, 263, 362, 386, 374, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477];

export const POSE_LANDMARK_NAMES = [
  "nose", "leftEyeInner", "leftEye", "leftEyeOuter", "rightEyeInner", "rightEye", "rightEyeOuter",
  "leftEar", "rightEar", "mouthLeft", "mouthRight", "leftShoulder", "rightShoulder", "leftElbow",
  "rightElbow", "leftWrist", "rightWrist", "leftPinky", "rightPinky", "leftIndex", "rightIndex",
  "leftThumb", "rightThumb", "leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle",
  "rightAnkle", "leftHeel", "rightHeel", "leftFootIndex", "rightFootIndex"
];

export const FACE_REGIONS = {
  forehead: [10, 67, 69, 104, 108, 109, 151, 299, 297, 333, 337, 338],
  leftCheek: [50, 101, 118, 119, 123, 147, 187, 205, 206, 207, 216],
  rightCheek: [280, 330, 347, 348, 352, 376, 411, 425, 426, 427, 436],
  leftEye: [33, 133, 159, 145, 160, 144, 158, 153, 468, 469, 470, 471, 472],
  rightEye: [263, 362, 386, 374, 385, 380, 387, 373, 473, 474, 475, 476, 477],
  nose: [1, 2, 4, 5, 6, 45, 98, 197, 327, 275],
  mouth: [13, 14, 17, 61, 78, 81, 82, 87, 291, 308, 311, 312, 317],
  chin: [152, 175, 199, 200, 201, 208, 428, 421]
};
