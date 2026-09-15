# Screenshots: local OCR, no login, zero cloud AI

Updated: 2026-09-15

## Processing contract

1. Validate/decode a local image, maximum 3 MiB and 20 million source pixels.
   Stable data-URL previews do not depend on temporary blob URL lifetime.
   Unsupported/corrupt files leave the previous valid preview in place.
2. Decode QR locally (native BarcodeDetector or jsQR 1.4.0) and recognize
   English + Traditional Chinese text with Tesseract.js in a browser worker.
   Reuse one worker and serialize OCR across main/chat uploads. Model language
   files may download/cache locally; screenshots are not uploaded to OCR servers.
3. Evaluate the existing sourced brand/sender and behavior-combination rules
   locally in email-risk.js. Unreadable or insufficient evidence remains unknown,
   not safe. OCR confidence is not proof of URL or sender authenticity.
4. URLs found in screenshots use the normal non-AI URL checks. Main, secondary
   selected URLs, and chat pass allowCloudAi:false. The flag also applies after
   shortlink resolution, skipping /api/check-fake-brand at the final destination.
   Visible text cannot establish a hidden button's actual destination.
5. /api/cf-vision returns HTTP 410 image_ai_disabled for all methods, before
   reading uploads, bindings or credentials. There is no manual AI review,
   provider fallback, AI reservation, retry or model invocation for images.
   Old clients calling this endpoint also cannot activate image inference.

## Local recovery controls

Main screenshot results have crop/re-OCR and editable recognized-text dialogs.
Cancellation terminates the active OCR worker and releases its queue; a later
upload can create a fresh worker. If initialization is still loading, cancellation
marks the job aborted and discards it once initialization completes.

Text edits are labeled as user-corrected content, not verified OCR evidence.
Original high-risk findings remain after crop or text edits. A new image upload
starts a new evidence context. OCR failures and canceled tasks stay unknown.
The browser's image/worker resources and mobile device performance still limit
practical throughput; this is not a promise of unlimited processing capacity.

## Privacy and chat

No login or shared image cache is introduced. Screenshot previews, extracted
text and edited text stay in page memory and are not persisted by this flow.
Language assets may be cached by Tesseract; they are not user image content.
Extracted URLs are sent to the existing URL-scanning services and their existing
audit rules still apply. This is not a fully offline URL checker.

Chat screenshot messages, their local reports and screenshot-derived URL
reports are marked localOnly. Later ordinary text-chat requests exclude these
messages and all imageUrl fields; only role/content from eligible text messages
are serialized. No raw OCR or screenshot is included as hidden chat context.

Ordinary text chat and independently typed URL brand analysis retain the
verified Workers Free gate and the shared atomic maximum 8,000 reserved
Neurons/day. See chat-free-only.md. Budget or storage failures stop AI, with
no paid fallback. Images do not use this budget. Non-AI API requests still
consume their services' applicable free resources.

## Verification

- npm run build:verified: production build and Node regression suite.
- PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/check-screenshot-preview.cjs:
  built frontend at 1280px and 390px, actual decoded preview/crop pixels,
  text edits, evidence retention, cancellation, unreadable files, missing bitmap
  API, main/chat image paths and zero image-triggered AI requests.
- The browser integration test stubs OCR and scan results for determinism.
  Production core tests separately exercise direct and resolved-shortlink scans
  with AI disabled, while keeping ordinary URL behavior unchanged.
- Pure legacy vision parsers remain exported solely for existing evidence
  regression tests; the closed endpoint never runs them or a model.
- Tests do not establish a real-world OCR accuracy rate. Evaluate consented,
  de-identified screenshots, including legitimate emails, before changing rules.

## References

- [Tesseract.js worker API](https://github.com/naptha/tesseract.js/blob/v5.1.1/docs/api.md)
- [Workers AI free plan and pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
