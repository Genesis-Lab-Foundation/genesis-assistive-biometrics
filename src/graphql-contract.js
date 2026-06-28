export function telemetryQueryGraphql() {
  return `query CameraControlSnapshot {
  telemetry {
    __typename
    stream {
      __typename
      status
      cameraFps
      renderFps
      targetRenderFps
      resolution { __typename width height }
      output { __typename width height }
      rotation
      aspect
      fit
      quality { __typename brightness sharpness }
      recording
    }
    face {
      __typename
      enabled
      version
      delegate
      modelReady
      modelLoading
      modelError
      stale
      lastSeenMsAgo
      detectError
      count
      faces {
        __typename
        index
        landmarks
        center { __typename x y }
        box { __typename x y width height }
        eyeOpen
        blink
        mouthOpen
        pose { __typename yaw pitch roll }
        regions {
          __typename
          name
          center { __typename x y }
          box { __typename x y width height }
          coverage
        }
        eyeScan {
          __typename
          enabled
          left { __typename center { __typename x y } openness iris { __typename x y } }
          right { __typename center { __typename x y } openness iris { __typename x y } }
        }
        tongue {
          __typename
          supported
          method
          candidate
          confidence
          requiredModel
          reason
        }
        blendshapes { __typename name score }
      }
    }
    hands {
      __typename
      enabled
      version
      delegate
      modelReady
      modelLoading
      modelError
      stale
      lastSeenMsAgo
      detectError
      count
      hands {
        __typename
        index
        label
        score
        landmarks
        box { __typename x y width height }
        wrist { __typename x y }
        thumbTip { __typename x y }
        indexTip { __typename x y }
        middleTip { __typename x y }
        ringTip { __typename x y }
        pinkyTip { __typename x y }
        openness
        pinch
      }
    }
    body {
      __typename
      enabled
      version
      delegate
      modelReady
      modelLoading
      modelError
      stale
      lastSeenMsAgo
      detectError
      count
      poses {
        __typename
        index
        landmarks
        center { __typename x y }
        box { __typename x y width height }
        keypoints {
          __typename
          name
          point { __typename x y }
          z
          visibility
          presence
        }
      }
    }
    audio {
      __typename
      enabled
      supported
      ready
      loading
      error
      capturedAt
      rms
      peak
      zeroCrossingRate
      spectralCentroidHz
      pitchHz
      voiceActivity
      sampleRate
      fftSize
    }
    interpretation {
      __typename
      time {
        __typename
        localIso
        hour
        minute
        weekday
        dayPeriod
      }
      affect {
        __typename
        primary
        confidence
        valence
        arousal
        attention
        engagement
        evidence
      }
      needs {
        __typename
        name
        confidence
        evidence
      }
      safety {
        __typename
        mode
        diagnostic
        reason
      }
    }
    buffer {
      __typename
      windowSeconds
      sampleCount
      oldestMsAgo
      latestMsAgo
      rolling {
        __typename
        faceLockRatio
        voiceActivityRatio
        avgValence
        avgArousal
        avgAttention
        avgEngagement
        avgMouthOpen
        avgEyeOpen
        avgHandOpenness
        topNeed { __typename name confidence evidence }
      }
    }
    training {
      __typename
      labelCount
      lastLabel {
        __typename
        id
        kind
        label
        createdAt
        windowSeconds
        sampleCount
      }
    }
    fingerprint {
      __typename
      enabled
      supported
      mode
      reason
    }
    oneTimeScan {
      __typename
      status
      storedHash
      reason
    }
  }
  cameraCapabilities {
    __typename
    requested {
      __typename
      width
      height
      cameraFps
      renderFps
      rotation
      aspect
      fit
    }
    track {
      __typename
      active
      readyState
      enabled
      muted
      label
      constraints
      settings
      capabilities
    }
    devices {
      __typename
      index
      label
      deviceId
      groupId
    }
  }
}`;
}

export function telemetrySchemaGraphql() {
  return `schema {
  query: Query
}

"""
Root queries for the local camera control runtime.
All values are produced in browser memory and are not persisted.
"""
type Query {
  """Current stream, render loop, quality, and face telemetry snapshot."""
  telemetry: Telemetry!

  """Requested constraints, active MediaStreamTrack state, and video inputs."""
  cameraCapabilities: CameraCapabilities!
}

"""Top-level telemetry snapshot for one UI refresh tick."""
type Telemetry {
  stream: StreamTelemetry!
  face: FaceTelemetry!
  hands: HandTelemetry!
  body: BodyTelemetry!
  audio: AudioTelemetry!
  interpretation: InterpretationTelemetry!
  buffer: BufferTelemetry!
  training: TrainingTelemetry!
  fingerprint: FingerprintCheck!
  oneTimeScan: OneTimeScan!
}

"""Camera stream and canvas renderer state."""
type StreamTelemetry {
  status: String!
  cameraFps: Float
  renderFps: Float!
  targetRenderFps: Int!
  resolution: Size
  output: Size
  rotation: Int!
  aspect: String!
  fit: String!
  quality: FrameQuality
  recording: Boolean!
}

"""Width and height in pixels."""
type Size {
  width: Int!
  height: Int!
}

"""Lightweight frame measurements from the rendered canvas."""
type FrameQuality {
  brightness: Float!
  sharpness: Float!
}

"""Ephemeral local face analysis state from MediaPipe Face Landmarker."""
type FaceTelemetry {
  enabled: Boolean!
  version: String
  delegate: String
  modelReady: Boolean
  modelLoading: Boolean
  modelError: String
  stale: Boolean!
  lastSeenMsAgo: Int
  detectError: String
  count: Int
  faces: [Face!]!
}

"""One detected face. Landmarks are counted here; full raw points stay canvas-only."""
type Face {
  index: Int!
  landmarks: Int!
  center: Point2D!
  box: Box2D!
  eyeOpen: Float!
  blink: Boolean!
  mouthOpen: Float!
  pose: FacePose
  regions: [FaceRegion!]!
  eyeScan: EyeScan!
  tongue: TongueTelemetry!
  blendshapes: [Blendshape!]!
}

"""Named face surface region derived from MediaPipe landmarks."""
type FaceRegion {
  name: String!
  center: Point2D!
  box: Box2D!
  coverage: Float!
}

"""Eye-specific landmarks and rough iris centers when available."""
type EyeScan {
  enabled: Boolean!
  left: EyeMetrics
  right: EyeMetrics
}

"""One eye region derived from face landmarks."""
type EyeMetrics {
  center: Point2D!
  openness: Float!
  iris: Point2D
}

"""Heuristic tongue state. Current model has no dedicated tongue class."""
type TongueTelemetry {
  supported: Boolean!
  method: String!
  candidate: Boolean!
  confidence: Float!
  requiredModel: String!
  reason: String!
}

"""Normalized 2D point in the rendered detection space."""
type Point2D {
  x: Float!
  y: Float!
}

"""Normalized bounding box in the rendered detection space."""
type Box2D {
  x: Float!
  y: Float!
  width: Float!
  height: Float!
}

"""Approximate head pose in degrees."""
type FacePose {
  yaw: Float!
  pitch: Float!
  roll: Float!
}

"""MediaPipe expression category and score."""
type Blendshape {
  name: String!
  score: Float!
}

"""Ephemeral local hand landmark analysis from MediaPipe Hand Landmarker."""
type HandTelemetry {
  enabled: Boolean!
  version: String
  delegate: String
  modelReady: Boolean
  modelLoading: Boolean
  modelError: String
  stale: Boolean!
  lastSeenMsAgo: Int
  detectError: String
  count: Int
  hands: [Hand!]!
}

"""One detected hand with compact landmark-derived metrics."""
type Hand {
  index: Int!
  label: String
  score: Float
  landmarks: Int!
  box: Box2D!
  wrist: Point2D
  thumbTip: Point2D
  indexTip: Point2D
  middleTip: Point2D
  ringTip: Point2D
  pinkyTip: Point2D
  openness: Float!
  pinch: Float!
}

"""Ephemeral local full-body pose analysis from MediaPipe Pose Landmarker."""
type BodyTelemetry {
  enabled: Boolean!
  version: String
  delegate: String
  modelReady: Boolean
  modelLoading: Boolean
  modelError: String
  stale: Boolean!
  lastSeenMsAgo: Int
  detectError: String
  count: Int
  poses: [Pose!]!
}

"""One detected body pose."""
type Pose {
  index: Int!
  landmarks: Int!
  center: Point2D!
  box: Box2D!
  keypoints: [PoseKeypoint!]!
}

"""Named body keypoint from head to feet."""
type PoseKeypoint {
  name: String!
  point: Point2D!
  z: Float
  visibility: Float
  presence: Float
}

"""Ephemeral local microphone feature extraction; no raw audio is stored."""
type AudioTelemetry {
  enabled: Boolean!
  supported: Boolean!
  ready: Boolean!
  loading: Boolean!
  error: String
  capturedAt: Int
  rms: Float
  peak: Float
  zeroCrossingRate: Float
  spectralCentroidHz: Float
  pitchHz: Float
  voiceActivity: Boolean!
  sampleRate: Int
  fftSize: Int
}

"""Assistive interpretation layer computed from raw local telemetry."""
type InterpretationTelemetry {
  time: TimeContext!
  affect: AffectTelemetry!
  needs: [NeedHypothesis!]!
  safety: InterpretationSafety!
}

"""Local time context for per-child routines and baseline calibration."""
type TimeContext {
  localIso: String!
  hour: Int!
  minute: Int!
  weekday: String!
  dayPeriod: String!
}

"""Prototype affect estimate. This is an assistive hint, not a diagnosis."""
type AffectTelemetry {
  primary: String!
  confidence: Float!
  valence: Float!
  arousal: Float!
  attention: Float!
  engagement: Float!
  evidence: [String!]!
}

"""Basic need hypothesis for caregiver confirmation."""
type NeedHypothesis {
  name: String!
  confidence: Float!
  evidence: [String!]!
}

"""Safety metadata for interpretation results."""
type InterpretationSafety {
  mode: String!
  diagnostic: Boolean!
  reason: String!
}

"""In-memory temporal feature buffer for the current session."""
type BufferTelemetry {
  windowSeconds: Int!
  sampleCount: Int!
  oldestMsAgo: Int
  latestMsAgo: Int
  rolling: RollingFeatures!
}

"""Rolling aggregates computed from recent feature vectors."""
type RollingFeatures {
  faceLockRatio: Float!
  voiceActivityRatio: Float!
  avgValence: Float
  avgArousal: Float
  avgAttention: Float
  avgEngagement: Float
  avgMouthOpen: Float
  avgEyeOpen: Float
  avgHandOpenness: Float
  topNeed: NeedHypothesis
}

"""Local labeled feature events for future per-child model training."""
type TrainingTelemetry {
  labelCount: Int!
  lastLabel: LabelEvent
}

"""One explicit caregiver label over the recent feature buffer."""
type LabelEvent {
  id: String!
  kind: String!
  label: String!
  createdAt: String!
  windowSeconds: Int!
  sampleCount: Int!
}

"""Fingerprint scanning capability status. Browser touchscreens do not expose ridge data."""
type FingerprintCheck {
  enabled: Boolean!
  supported: Boolean!
  mode: String!
  reason: String!
}

"""One-time biometric scan action state. Raw biometric hashes are intentionally not stored."""
type OneTimeScan {
  status: String!
  storedHash: String
  reason: String!
}

"""Camera settings and browser-reported MediaStreamTrack objects."""
type CameraCapabilities {
  requested: CameraRequest!
  track: MediaTrack!
  devices: [VideoInputDevice!]!
}

"""Values requested by the UI controls."""
type CameraRequest {
  width: Int
  height: Int
  cameraFps: Int
  renderFps: Int!
  rotation: Int!
  aspect: String!
  fit: String!
}

"""Active MediaStreamTrack state. Browser-specific maps are JSON scalars."""
type MediaTrack {
  active: Boolean!
  readyState: String!
  enabled: Boolean
  muted: Boolean
  label: String
  constraints: JSON!
  settings: JSON!
  capabilities: JSON!
}

"""Browser video input device. IDs are shortened for display."""
type VideoInputDevice {
  index: Int!
  label: String
  deviceId: String!
  groupId: String!
}

"""Arbitrary browser MediaStreamTrack object map."""
scalar JSON`;
}
