# Ethics and Safety Notes

Genesis Assistive Biometrics is intended as assistive research software for caregiver-supported communication. It must not be presented as medical diagnosis, clinical decision automation, identity verification, lie detection, emotion truth detection, or behavioral scoring.

## Intended Use

- Explore local-first assistive telemetry for nonverbal or minimally verbal children.
- Help caregivers review possible emotional states and basic wants.
- Provide transparent evidence, confidence, and manual labels for research review.

## Non-Goals

- No diagnosis.
- No autonomous medical decisions.
- No hidden surveillance.
- No biometric identity database.
- No claim that facial expression equals internal emotional truth.

## Human Research Requirements

Any testing with people, especially children or disabled participants, should use an appropriate institutional review process before data collection.

Minimum expectations:

- informed consent from a legal guardian,
- child assent where possible,
- right to stop at any time,
- plain-language explanation of what is captured,
- clear data retention and deletion policy,
- no publication of identifiable images without explicit consent,
- adult confirmation for every output hypothesis.

## Privacy Defaults

- Process streams in browser memory.
- Store no raw video, audio, or biometric templates by default.
- Make recording, snapshots, and exports explicit.
- Prefer WebAuthn/passkeys over storing biometric hashes.
- Keep exported datasets encrypted and removable.

## Model Limitations

The current affect and wants layer is a heuristic baseline. It can be wrong, biased by lighting/camera angle, unstable across children, and especially unreliable under occlusion, distress, unusual movement, or low connectivity. Outputs should be treated as caregiver prompts, not facts.
