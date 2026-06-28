import {
  averageScores,
  clamp01,
  clampSigned,
  dayPeriod,
  distance,
  localIsoString,
  scoreOf
} from "./math.js";

export function timeContextSnapshot() {
  const date = new Date();
  const hour = date.getHours();
  return {
    __typename: "TimeContext",
    localIso: localIsoString(date),
    hour,
    minute: date.getMinutes(),
    weekday: date.toLocaleDateString("en-US", { weekday: "long" }),
    dayPeriod: dayPeriod(hour)
  };
}

export function affectSnapshot(face, audio, body) {
  if (!face) {
    const vocalizing = Boolean(audio?.voiceActivity);
    return {
      __typename: "AffectTelemetry",
      primary: vocalizing ? "vocalizing_no_face" : "unknown",
      confidence: vocalizing ? 0.22 : 0,
      valence: 0,
      arousal: vocalizing ? 0.42 : 0,
      attention: 0,
      engagement: vocalizing ? 0.2 : 0,
      evidence: vocalizing ? ["voice activity without face lock"] : ["no face lock"]
    };
  }

  const smile = averageScores(face.blendScores, ["mouthSmileLeft", "mouthSmileRight"]);
  const frown = averageScores(face.blendScores, ["mouthFrownLeft", "mouthFrownRight", "browDownLeft", "browDownRight"]);
  const eyeWide = averageScores(face.blendScores, ["eyeWideLeft", "eyeWideRight"]);
  const eyeSquint = averageScores(face.blendScores, ["eyeSquintLeft", "eyeSquintRight"]);
  const jawOpen = Math.max(scoreOf(face.blendScores, "jawOpen"), face.mouthOpen);
  const headCentered = face.pose
    ? clamp01(1 - (Math.abs(face.pose.yaw) / 55 + Math.abs(face.pose.pitch) / 45) / 2)
    : 0.5;
  const faceArea = clamp01((face.box?.width || 0) * (face.box?.height || 0) * 18);
  const voiceBoost = audio?.voiceActivity ? 0.2 : 0;
  const bodyBoost = body ? 0.08 : 0;

  const valence = clampSigned((smile * 1.7) - (frown * 1.25) - (eyeSquint * 0.25));
  const arousal = clamp01(jawOpen * 0.7 + eyeWide * 0.55 + voiceBoost + bodyBoost);
  const attention = clamp01(headCentered * 0.72 + faceArea * 0.28);
  const engagement = clamp01(attention * 0.5 + arousal * 0.25 + Math.max(smile, voiceBoost) * 0.25);
  const primary = primaryAffect({
    smile,
    frown,
    eyeWide,
    eyeOpen: face.eyeOpen,
    jawOpen,
    valence,
    arousal,
    attention,
    voiceActivity: Boolean(audio?.voiceActivity)
  });
  const confidence = clamp01(0.28 + faceArea * 0.22 + Math.max(smile, frown, eyeWide, jawOpen) * 0.22 + (audio?.voiceActivity ? 0.06 : 0));
  const evidence = affectEvidence({ smile, frown, eyeWide, eyeOpen: face.eyeOpen, jawOpen, headCentered, faceArea, attention, audio });

  return {
    __typename: "AffectTelemetry",
    primary,
    confidence: Number(confidence.toFixed(3)),
    valence: Number(valence.toFixed(3)),
    arousal: Number(arousal.toFixed(3)),
    attention: Number(attention.toFixed(3)),
    engagement: Number(engagement.toFixed(3)),
    evidence
  };
}

export function needHypotheses(face, hands, body, audio, affect, time) {
  const mouthCenter = faceRegionCenter(face, "mouth");
  const handNearMouth = mouthCenter ? hands.some((hand) => handNearPoint(hand, mouthCenter, 0.12)) : false;
  const faceCenter = face?.center || null;
  const handNearFace = faceCenter ? hands.some((hand) => handNearPoint(hand, faceCenter, 0.18)) : false;
  const mealWindow = [7, 8, 12, 13, 18, 19].includes(time.hour);
  const morningOrEvening = time.hour <= 9 || time.hour >= 20;
  const activeHands = hands.some((hand) => hand.openness > 1.25 || hand.pinch < 0.45);
  const pinching = hands.some((hand) => hand.pinch < 0.38);
  const visibleBody = Boolean(body);
  const leavingFrame = Boolean(body?.box && (body.box.x < 0.04 || body.box.x + body.box.width > 0.96));
  const vocalizing = Boolean(audio?.voiceActivity);
  const mouthOpen = face?.mouthOpen || 0;
  const arousal = affect.arousal || 0;
  const lowValence = (affect.valence || 0) < -0.15;
  const positive = (affect.valence || 0) > 0.18;
  const tiredSignal = affect.primary === "tired" || ((face?.eyeOpen ?? 1) < 0.22 && arousal < 0.36);
  const overloadedSignal = affect.primary === "overloaded" || (lowValence && arousal > 0.5);
  const calmSignal = arousal < 0.28 && !lowValence;
  const turnedAway = face?.pose ? Math.abs(face.pose.yaw) > 30 || Math.abs(face.pose.pitch) > 28 : false;
  const engaged = (affect.engagement || 0) > 0.36;
  const night = time.dayPeriod === "night";

  const hypotheses = [
    needHypothesis("drink", 0.12 + mouthOpen * 0.22 + (handNearMouth ? 0.18 : 0) + (vocalizing ? 0.06 : 0), [
      mouthOpen > 0.25 ? "mouth opening" : null,
      handNearMouth ? "hand near mouth" : null,
      vocalizing ? "vocalization" : null
    ]),
    needHypothesis("eat", 0.08 + (mealWindow ? 0.18 : 0) + (handNearMouth ? 0.22 : 0) + mouthOpen * 0.14, [
      mealWindow ? "meal-time window" : null,
      handNearMouth ? "hand near mouth" : null,
      mouthOpen > 0.2 ? "mouth movement" : null
    ]),
    needHypothesis("toilet", 0.05 + (morningOrEvening ? 0.13 : 0) + (lowValence ? 0.09 : 0) + (arousal > 0.55 ? 0.06 : 0), [
      morningOrEvening ? "morning/evening routine window" : null,
      lowValence ? "negative valence signal" : null,
      arousal > 0.55 ? "high arousal" : null
    ]),
    needHypothesis("outside", 0.08 + (visibleBody ? 0.1 : 0) + (arousal > 0.45 ? 0.12 : 0) + (lowValence ? 0.08 : 0) + (leavingFrame ? 0.1 : 0), [
      visibleBody ? "body pose visible" : null,
      arousal > 0.45 ? "high arousal" : null,
      lowValence ? "negative valence signal" : null,
      leavingFrame ? "body near frame edge" : null
    ]),
    needHypothesis("play", 0.1 + (positive ? 0.18 : 0) + (activeHands ? 0.16 : 0) + (time.dayPeriod === "afternoon" ? 0.06 : 0), [
      positive ? "positive valence signal" : null,
      activeHands ? "active hands" : null,
      time.dayPeriod === "afternoon" ? "afternoon context" : null
    ]),
    needHypothesis("sleep", 0.05 + (tiredSignal ? 0.28 : 0) + (night ? 0.12 : 0) + (calmSignal ? 0.06 : 0), [
      tiredSignal ? "tired affect signal" : null,
      night ? "night routine window" : null,
      calmSignal ? "low arousal" : null
    ]),
    needHypothesis("help", 0.07 + (lowValence ? 0.14 : 0) + (vocalizing ? 0.1 : 0) + (handNearFace ? 0.08 : 0), [
      lowValence ? "negative valence signal" : null,
      vocalizing ? "vocalization" : null,
      handNearFace ? "hand near face" : null
    ]),
    needHypothesis("break", 0.06 + (overloadedSignal ? 0.26 : 0) + (tiredSignal ? 0.1 : 0) + (turnedAway ? 0.08 : 0), [
      overloadedSignal ? "overload affect signal" : null,
      tiredSignal ? "tired affect signal" : null,
      turnedAway ? "head turned away" : null
    ]),
    needHypothesis("quiet", 0.05 + (overloadedSignal ? 0.18 : 0) + (vocalizing ? 0.05 : 0) + (arousal > 0.5 ? 0.06 : 0), [
      overloadedSignal ? "overload affect signal" : null,
      vocalizing ? "sound event" : null,
      arousal > 0.5 ? "high arousal" : null
    ]),
    needHypothesis("hug", 0.04 + (lowValence && arousal < 0.48 ? 0.16 : 0) + (handNearFace ? 0.08 : 0), [
      lowValence && arousal < 0.48 ? "sad or low-valence calm state" : null,
      handNearFace ? "hand near face" : null
    ]),
    needHypothesis("more", 0.06 + (positive ? 0.16 : 0) + (engaged ? 0.12 : 0) + (pinching ? 0.06 : 0), [
      positive ? "positive valence signal" : null,
      engaged ? "engaged with camera" : null,
      pinching ? "pinch gesture" : null
    ]),
    needHypothesis("stop", 0.05 + (overloadedSignal ? 0.2 : 0) + (turnedAway ? 0.12 : 0) + (lowValence ? 0.08 : 0), [
      overloadedSignal ? "overload affect signal" : null,
      turnedAway ? "head turned away" : null,
      lowValence ? "negative valence signal" : null
    ]),
    needHypothesis("yes", 0.04 + (positive ? 0.14 : 0) + (engaged ? 0.1 : 0) + (calmSignal ? 0.04 : 0), [
      positive ? "positive valence signal" : null,
      engaged ? "engaged with camera" : null,
      calmSignal ? "calm state" : null
    ]),
    needHypothesis("no", 0.04 + (turnedAway ? 0.16 : 0) + (lowValence ? 0.12 : 0) + (overloadedSignal ? 0.08 : 0), [
      turnedAway ? "head turned away" : null,
      lowValence ? "negative valence signal" : null,
      overloadedSignal ? "overload affect signal" : null
    ]),
    needHypothesis("music", 0.04 + (vocalizing ? 0.16 : 0) + (positive ? 0.1 : 0) + (calmSignal ? 0.05 : 0), [
      vocalizing ? "vocalization" : null,
      positive ? "positive valence signal" : null,
      calmSignal ? "calm state" : null
    ])
  ];

  return hypotheses
    .map((item) => ({ ...item, confidence: Number(Math.min(0.72, item.confidence).toFixed(3)) }))
    .sort((a, b) => b.confidence - a.confidence);
}

function needHypothesis(name, confidence, evidence) {
  const cleanEvidence = evidence.filter(Boolean);
  return {
    __typename: "NeedHypothesis",
    name,
    confidence: clamp01(confidence),
    evidence: cleanEvidence.length ? cleanEvidence : ["baseline only"]
  };
}

function primaryAffect({ smile, frown, eyeWide, eyeOpen, jawOpen, valence, arousal, attention, voiceActivity }) {
  if (voiceActivity && arousal > 0.62 && valence < -0.08) return "overloaded";
  if (voiceActivity && frown > 0.22 && valence < -0.1) return "hurt";
  if (voiceActivity && jawOpen > 0.25) return "vocalizing";
  if (eyeOpen < 0.2 && arousal < 0.36) return "tired";
  if (smile > 0.22 && valence > 0.12) return "positive";
  if (eyeWide > 0.28 && valence < -0.05) return "scared";
  if (frown > 0.22 && arousal > 0.38) return "angry";
  if (valence < -0.2 && arousal <= 0.42) return "sad";
  if (eyeWide > 0.22 || jawOpen > 0.42) return "surprised";
  if (frown > 0.14 && Math.abs(valence) < 0.16) return "confused";
  if (arousal < 0.18 && attention < 0.35) return "bored";
  if (arousal > 0.58 && valence < 0.08) return "overloaded";
  return "neutral";
}

function affectEvidence({ smile, frown, eyeWide, eyeOpen, jawOpen, headCentered, faceArea, attention, audio }) {
  const evidence = [];
  if (smile > 0.12) evidence.push(`smile ${smile.toFixed(2)}`);
  if (frown > 0.12) evidence.push(`brow/frown ${frown.toFixed(2)}`);
  if (eyeWide > 0.12) evidence.push(`eye wide ${eyeWide.toFixed(2)}`);
  if (eyeOpen < 0.25) evidence.push(`eye open ${eyeOpen.toFixed(2)}`);
  if (jawOpen > 0.18) evidence.push(`mouth open ${jawOpen.toFixed(2)}`);
  if (audio?.voiceActivity) evidence.push("voice activity");
  evidence.push(`head attention ${headCentered.toFixed(2)}`);
  evidence.push(`attention ${attention.toFixed(2)}`);
  evidence.push(`face coverage ${faceArea.toFixed(2)}`);
  return evidence;
}

function faceRegionCenter(face, regionName) {
  return face?.regions?.find((region) => region.name === regionName)?.center || null;
}

function handNearPoint(hand, point, threshold) {
  const candidates = [hand.thumbTip, hand.indexTip, hand.middleTip, hand.ringTip, hand.pinkyTip].filter(Boolean);
  return candidates.some((candidate) => distance(candidate, point) <= threshold);
}
