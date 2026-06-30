# Genesis Assistive Biometrics

Charitable local-first assistive technology prototype by Genesis Lab Foundation.

The project explores whether browser-only camera, pose, hand, face, and audio telemetry can help caregivers understand nonverbal or minimally verbal children. The first target scenario is an AAC-style interface: the child sees a calm cat-mask experience and emoji cards, while the caregiver can inspect raw telemetry, evidence, and labels.

Live URL: https://genesis-assistive-biometrics-production.up.railway.app/

Support us: https://t.me/genesis_lab_foundation

## Status

Research prototype. Not a medical device. Not diagnostic software. Not a replacement for clinical evaluation, caregiver judgment, or emergency care.

## Privacy Model

- Runs locally in the browser.
- Video and audio streams are processed in memory.
- Raw biometric data is not stored by default.
- Snapshots, recordings, and label exports require explicit user action.
- Biometric hash storage is intentionally disabled; use WebAuthn/passkeys for future ownership checks.

## Features

- Camera controls: device, resolution, camera FPS, render FPS, rotation, aspect ratio, fit.
- Face telemetry: MediaPipe Face Landmarker, dense landmarks, blendshapes, head pose, eye scan, mouth openness, face regions.
- Hand telemetry: hand landmarks, handedness, fingertips, openness, pinch.
- Body telemetry: pose landmarks from head to feet.
- Audio telemetry: RMS, peak, zero-crossing rate, spectral centroid, rough pitch, voice activity.
- Interpretation layer: affect estimates, AAC-style wants/core-word hypotheses, confidence, evidence.
- Child mode: AR cat mask over the real face plus emoji emotion/want strips.
- GraphQL-style contract: self-described query/schema/response blocks for inspection.
- Lab page: open-source/free candidates for future tracking and classifier experiments.

Planned multimodal layer:

- wearable signals from Apple Watch and other smart watches/bands when explicitly consented,
- heart rate, HRV, movement, sleep/rest context, activity state, and stress-adjacent signals where available,
- no medical interpretation without clinical validation.

## Run

```bash
npm start
```

Default URL. The root route opens the research lab page; use `Launch` there to open the camera app:

```text
http://127.0.0.1:5174
```

Fixed local test URL:

```bash
npm run start:1337
```

## Check

```bash
npm run check
```

## Structure

```text
app.js                         Browser runtime orchestration, stream lifecycle, UI wiring
server.js                      Tiny local static server
src/config.js                  Model URLs, timing constants, landmark groups
src/vocabulary.js              AAC wants/core words and child emoji labels
src/interpretation.js          Affect and need hypotheses with evidence
src/graphql-contract.js        GraphQL-style query and schema text
src/math.js                    Pure geometry, scoring, formatting helpers
docs/assistive-biometrics-roadmap.md
ETHICS.md
CONTRIBUTING.md
outreach/institution-email-template.md
```

## Research Notes

The current interpretation layer is a transparent heuristic baseline. It is designed to be reviewed, challenged, labeled, and replaced by per-child models only after consented data collection.

Priority next steps:

- caregiver-approved labeling workflow,
- validation protocol with clinicians/researchers,
- gesture classifier,
- mouth/tongue classifier,
- nonverbal audio classifier,
- optional wearable physiology integration,
- per-child calibration and baseline drift checks.

## License

Apache-2.0.
