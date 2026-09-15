# Screenshot AI: free-only controls

## Flow

1. Decode QR codes locally (native BarcodeDetector, then pinned jsQR 1.4.0) and run Tesseract English + Traditional Chinese OCR. Only OCR results with confidence >= 80 are eligible for automatic URL extraction. OCR confidence is not a guarantee that a URL was read correctly.
2. Evaluate cross-brand behavior rules and sourced references locally (`email-risk.js`; see `email-evidence.md`). Show a high-risk evidence report or **unknown**, never infer safety from missing evidence. Send locally extracted URLs through the existing main URL scanner without replacing the content warning. Multiple destinations remain selectable; chat scans its extracted destinations in sequence.
3. No screenshot automatically calls vision AI, even with no URL or failed OCR. Only the main result's explicit **AI 圖片複核** action normalizes the screenshot in the browser and calls `/api/cf-vision`. PNG/JPEG/WebP uploads are limited to 3 MiB; normalized images have a maximum 2400-pixel long edge and 20-million-pixel source limit. Canvas re-encoding removes source metadata. Do not upload sensitive material unnecessarily. Local high-risk and unresolved-action reports survive lower-risk model replies; failed manual reviews restore the local report.
4. Workers AI uses `@cf/meta/llama-3.2-11b-vision-instruct` with a structured JSON contract. Invalid/truncated responses, contradictory classifications and low-confidence/illegible results become **unknown**. Returned URLs go through the same main scanner, including its redirect, trusted-domain and strong-threat policies. An official URL cannot override image content risk.
5. No Gemini or other provider fallback. Unknown, quota, busy and failed results stop AI. Manual review returns a separate notice and retains the existing local evidence, OCR URLs and URL scan result; it does not retry or label missing evidence safe.

Model output is untrusted. No model-provided URLs are fetched by the vision endpoint. Browser extraction excludes email, credentials and non-HTTP schemes; URL path/query case is preserved. A model's self-reported confidence and risk are not independently verified facts.

## Shared budget

All AI entry points (`/api/chat`, `/api/cf-vision`, `/api/check-fake-brand`) require the shared free-plan gate and D1 binding **AI_BUDGET**. See `chat-free-only.md` for the verified Free plan and compatible gate settings. Apply `migrations/0001_ai_budget.sql` before activating the code. Missing/broken storage disables AI calls, while non-AI URL scanning remains available. Preview and production must share this database if they use the same account allowance.

The `antiscam` Pages project has this binding configured for production and preview, pointing to `antiscam-ai-budget` (`27b3ec0c-d674-43f2-9a4f-1755e7fea77c`). The schema was initialized on 2026-09-05. Existing production AI binding and secret names were preserved. Preview still has no AI binding, as before; this change does not enable preview inference. Gemini free-tier confirmation remains unset.

| Setting | Default | Hard maximum |
| --- | --- | --- |
| `AI_DAILY_NEURONS` | 8000 reserved Neurons/day | 8000 |
| `AI_FREE_ONLY_CONFIRMED` | legacy confirmed flag if absent; otherwise off | literal `true` required |

Invalid numeric settings disable admission. Zero is an intentional off switch. The Cloudflare account must already have an `AI` binding. Gemini secrets and confirmation flags no longer enable any inference. Never put keys in frontend JavaScript.

Cloudflare requests reserve 650 Neurons per image and 400 per brand analysis; chat uses a conservative UTF-8 input estimate (see `chat-free-only.md`). These are reservations, not billing measurements. Vision covers the published 128K context at 4410 Neurons/M input plus 1024 output tokens at 61493 Neurons/M. Reservations are not refunded after failures or incomplete accounting. With no other AI calls, the default budget allows **12 image analyses daily**. Local OCR/QR and non-AI URL checks do not use this AI budget.

The reservation is one atomic SQLite statement, including the provider/day total, concurrent leases, requests in the last minute and circuit breaker. Cloudflare permits two concurrent calls and 10/minute. Each image/chat call has a 20-second deadline; brand analysis uses six seconds. Timeouts retain their five-minute lease because a Workers AI binding call cannot be cancelled reliably. Quota errors stop calls until next 00:00 UTC (08:00 Taiwan); other provider failures open a one-minute circuit. A read-only diagnostic after denied admission distinguishes daily budget exhaustion from temporary busy states; it never retries admission. An ambiguous upstream 429 is conservatively treated as quota exhaustion. There is no automatic retry or provider escalation.

**This shared budget covers all three AI endpoints, not all account activity.** Other projects or direct API callers can consume the same free Cloudflare allowance. The verified Workers Free plan provides the platform stop; app estimates alone cannot guarantee zero costs on Paid. Confirm the account plan before activation and disable the shared gate before a plan change. Review reservations whenever changing a model. Do not enable billing or accept model licenses automatically.

## Privacy and audit

Screenshot previews use bounded, locally read data URLs after an `Image`
decode/dimension check, rather than temporary object URLs. This avoids relying
on blob URL lifetime during OCR and manual review. An unsupported/corrupt image
shows a format error without replacing the last valid preview. No preview data
is sent to AI automatically. `scripts/check-screenshot-preview.cjs` tests the
built frontend at desktop/mobile sizes with synthetic images, unavailable blob
URLs, missing bitmap APIs and a mocked quota response; it verifies decoded
image pixels and chat previews without live AI calls.

The application does not persist uploaded screenshots, OCR text, prompts, model reply text or extracted private URLs in the AI database. Only request ID, provider/model, reservation, timestamps, transport outcome, structured assessment outcome/risk, latency and token counts (when returned) are recorded. Logs do not include secrets or raw errors. Existing main URL-scanner audit behavior is separate and unchanged.

Browser requests are coalesced by a SHA-256 image fingerprint. Up to 16 results are kept in page memory with a five-minute eligibility window; errors and unknown results are not cached. This is not a cross-user cache or a persistent image store. The browser already keeps the preview/report while the page remains open.

Database rows older than 30 days are removed opportunistically after admitted calls; this is **not a strict deletion deadline** when the service is idle. No raw content is stored in those rows. Provider-side processing/retention follows the provider terms, independently of the application database policy.

Example metadata audit query:

```sql
SELECT provider, model, day, status, result_status, risk_level,
       COUNT(*) AS requests, SUM(reserved) AS reserved_total,
       AVG(latency_ms) AS average_latency_ms
FROM ai_requests
GROUP BY provider, model, day, status, result_status, risk_level;
```

## Validation

Run `npm test` (Node 22.13+ for the SQLite test adapter). Tests execute the production parser, frontend handlers and D1 reservation SQL. They cover the shared free-plan gate, malformed output, unknown colors, official URLs with dangerous content, quotas, timeouts, concurrency, no Gemini fallback and retention of local evidence after failed review. Mock-provider tests validate control flow, **not** real-world model accuracy. Before changing models, evaluate consented, de-identified Traditional Chinese fixtures and measure false-positive/false-negative rates.

## Official references

- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Llama 3.2 Vision model and license requirements](https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/)
- [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini API additional terms](https://ai.google.dev/gemini-api/terms)
