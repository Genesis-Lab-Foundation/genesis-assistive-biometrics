# Contributing

This project handles sensitive assistive and biometric research code. Contributions should keep the system local-first, transparent, and caregiver-confirmed.

## Engineering Principles

- Keep raw stream processing ephemeral unless a user explicitly records or exports.
- Keep interpretation outputs explainable with `confidence` and `evidence`.
- Prefer small pure modules for vocabulary, math, interpretation, and contracts.
- Avoid adding cloud calls, trackers, analytics, or remote storage by default.
- Do not add medical claims.
- Do not add hidden biometric identification.

## Pull Request Checklist

- `npm run check` passes.
- Privacy defaults remain local-first.
- New model outputs include limitations and evidence.
- UI changes keep child mode low-stimulation.
- Documentation is updated when behavior changes.

## Data and Testing

Do not commit real participant video, audio, images, biometric templates, or exported labels. Use synthetic fixtures or clearly consented public examples only.
