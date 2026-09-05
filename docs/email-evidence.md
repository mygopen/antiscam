# Screenshot Email Evidence

`email-risk.js` is shared by the browser and the vision endpoint. It contains a small, sourced sender registry, local line extraction and deterministic combination rules. No new API key or database is required.

## Registry

The initial entry is FETC/eTag. The official electronic-bill page publishes `FETCService@fetc.net.tw`; this establishes a known sender domain, not an exhaustive list or a guarantee of authenticity. Website trust lists are not reused as sender authorization.

Each brand has aliases, exact sender domains, separately verified delegated domains, purpose, source links and verification date. `includeSubdomains` defaults to false. Only add a delegate with independently verified evidence; do not infer it from a suspicious message. Review entries within 366 days; stale/future-dated records cannot activate the combination rule. The registry is intentionally not an email-provider blacklist.

## Extraction And Rule

OCR lines retain their individual confidence and original line number. Lines below 80/100 are not evidence. The text-only OCR fallback uses overall confidence when the engine supplies no line data. Ambiguous sender/recipient labels on the same line abstain. Labels separated from addresses by unreadable lines cannot establish a sender role.

OCR-inserted horizontal spaces between Chinese characters and within email separators are normalized without guessing letters or missing dots. At most two malformed email lines are cropped in memory, enlarged, contrast-normalized and reread with English OCR. A domain is accepted only at confidence >= 80; when symbol data is available, every domain character must meet that threshold independently of the private local part. Low-confidence or ambiguous domains remain unverified. Malformed `@` tokens are excluded from URL extraction, so a local part such as `redacted.name` is not mistaken for a website.

Returned evidence includes brand reference, sender/recipient/body domain roles, subject line locations, payment failure/action signals, TWD amounts and whether a plate is visible. Full email local parts, private names, exact plates and raw OCR text are not retained in the assessment or written to the AI database. Amount and absent plate are never independent risk triggers. An absent plate means only **not visible in this excerpt**, not absent from the full email.

`mail-brand-unlisted-payment-login-v1` requires all of:

- A recognized brand with current reference data.
- A confidently read sender or brand-adjacent claimed-sender domain absent from verified records.
- A visible payment-failure/arrears statement.
- A visible request to log in, verify an account or confirm billing information.
- No explicit opening education/example heading.

The result is **high risk, suspected impersonation**, not confirmed origin fraud. A listed sender is not marked safe; the screenshot cannot establish SPF, DKIM, DMARC or the actual link destination. Body/recipient addresses do not count as sender mismatch evidence. A generic fraud-warning footer does not exempt a message. This rule is a heuristic, including its education-context recognition, not protection against every adversarial layout.

## Integration

Main upload and chat execute local email assessment before the OCR-URL early return. A high combination result is shown even without any URL and avoids a cloud model call. If URLs are also present, main URL scanning still runs without replacing the email warning. An inconclusive local assessment retains the existing AI fallback when there is no URL. Brand billing/login requests with unverified senders require content review even when a URL is present; extracted URL candidates are preserved through this review. A low/none model result cannot turn those unresolved mail signals into a safe image result. Other URL-only cases retain the separate content-analysis action.

The vision prompt asks for at most ten relevant visible `mailLines` with confidence, retaining sender/recipient labels and masking email local parts. The same deterministic evaluator checks them. Model-extracted text/confidence can still be wrong; it is not authenticated evidence. Invalid/illegible model output cannot trigger the rule. The response exposes only the structured assessment, never `mailLines`; Gemini still receives fixed behavior enums only.

The vision output cap is 1024 tokens to accommodate evidence. Its unchanged 650-Neuron reservation covers 128K input plus that output cap at the documented rates. No quota, billing or deployment configuration is changed by this feature.

Tests use manually de-identified text, not the user's original screenshot. Run `npm test`. They cover the no-URL example, normal/legitimate delegated senders, mixed recipient labels, low-confidence lines, educational context, spoofed suffixes and stale records. Real OCR/model accuracy remains dependent on screenshot quality.

On 2026-09-05, the supplied original eTag screenshot was tested locally with real Tesseract OCR in a mobile Chromium viewport. Initial OCR lost the domain dot; region rereading and domain-character confidence recovered `upcmail.nl`, triggering the high-risk combination without any cloud API request. No original image or private screenshot was saved as a fixture. This is one successful sample, not a measured general accuracy rate.
