# Screenshot AI: free-tier-first controls

## Flow

1. Decode QR codes locally (native BarcodeDetector, then pinned jsQR 1.4.0) and run Tesseract English + Traditional Chinese OCR. Only OCR results with confidence >= 80 are eligible for automatic URL extraction. OCR confidence is not a guarantee that a URL was read correctly.
2. Evaluate cross-brand behavior rules and sourced references locally (`email-risk.js`; see `email-evidence.md`). Show a high-risk evidence report or **unknown**, never infer safety from missing evidence. Send locally extracted URLs through the existing main URL scanner without replacing the content warning. Multiple destinations remain selectable; chat scans its extracted destinations in sequence.
3. No screenshot automatically calls vision AI, even with no URL or failed OCR. Only the main result's explicit **AI 圖片複核** action normalizes the screenshot in the browser and calls `/api/cf-vision`. PNG/JPEG/WebP uploads are limited to 3 MiB; normalized images have a maximum 2400-pixel long edge and 20-million-pixel source limit. Canvas re-encoding removes source metadata. Do not upload sensitive material unnecessarily. Local high-risk and unresolved-action reports survive lower-risk model replies; failed manual reviews restore the local report.
4. Workers AI uses `@cf/meta/llama-3.2-11b-vision-instruct` with a structured JSON contract. Invalid/truncated responses, contradictory classifications and low-confidence/illegible results become **unknown**. Returned URLs go through the same main scanner, including its redirect, trusted-domain and strong-threat policies. An official URL cannot override image content risk.
5. Gemini is an optional **signal-classification fallback**, not a second image reader. It is eligible only when Cloudflare produced readable, sufficiently confident, fixed-enum behavior signals but left the risk unknown. It receives no image, extracted text, URL, email, account number, filename or user identifier. It cannot rescue a total Cloudflare outage or illegible screenshot. It cannot lower an existing high-risk result.

Model output is untrusted. No model-provided URLs are fetched by the vision endpoint. Browser extraction excludes email, credentials and non-HTTP schemes; URL path/query case is preserved. A model's self-reported confidence and risk are not independently verified facts.

## Shared budget

Both `/api/chat` and `/api/cf-vision` require the D1 binding **AI_BUDGET**. Apply `migrations/0001_ai_budget.sql` before activating the new code. Missing/broken storage disables AI calls, while ordinary URL scanning remains available. Preview and production must share this database if they use the same account allowance.

The `antiscam` Pages project has this binding configured for production and preview, pointing to `antiscam-ai-budget` (`27b3ec0c-d674-43f2-9a4f-1755e7fea77c`). The schema was initialized on 2026-09-05. Existing production AI binding and secret names were preserved. Preview still has no AI binding, as before; this change does not enable preview inference. Gemini free-tier confirmation remains unset.

| Setting | Default | Hard maximum |
| --- | --- | --- |
| `AI_DAILY_NEURONS` | 8000 reserved Neurons/day | 8000 |
| `GEMINI_FREE_TIER_CONFIRMED` | unset (disabled) | literal `true` required |
| `GEMINI_DAILY_REQUESTS` | 20 | 100 |
| `GEMINI_RPM` | 2 | 10 |

Invalid numeric settings disable admission. Zero is an intentional off switch. The Cloudflare account must already have an `AI` binding. Gemini additionally needs `GEMINI_API_KEY` in server-side secrets. Never put keys in frontend JavaScript.

Cloudflare requests reserve 650 Neurons per image and 400 per chat. These are deliberately conservative, not measurements: the vision reserve covers the published 128K context at 4410 Neurons/M input plus 1024 output tokens at 61493 Neurons/M; chat is bounded to 6000 JavaScript characters plus its prompt and 80 output tokens. Reservations are not refunded from uncertain accounting or failed calls. With no other calls, the default budget therefore allows **12 image analyses or 20 chats daily**, not both. Local OCR/QR and URL scans do not use this AI budget.

The reservation is one atomic SQLite statement, including the provider/day total, concurrent leases, requests in the last minute and circuit breaker. Cloudflare permits two concurrent calls and 10/minute; Gemini permits one concurrent call. Each model call has a 20-second deadline. Timeouts retain their five-minute lease because a Workers AI binding call cannot be cancelled reliably. Quota errors open a one-hour circuit; other provider failures open a one-minute circuit. There is no automatic retry or Gemini Pro escalation. Cloudflare resets use UTC; Gemini days use America/Los_Angeles.

**This budget covers the two endpoints above, not all account activity.** The existing URL brand-check endpoint (`check-fake-brand`, Gemma) is unchanged and does not use this ledger. Other projects or direct API callers can consume the same free Cloudflare allowance. Confirm the account plan, allocate a smaller application limit when necessary, and monitor the provider dashboard. Model prices/context limits can change; review reservations whenever changing a model. Paid Gemini projects can charge from the first call even if this application's request count is low. Set `GEMINI_FREE_TIER_CONFIRMED=true` only after verifying the specific key/project is on the unpaid tier and the selected model is eligible. Do not enable billing or accept model licenses automatically.

## Privacy and audit

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

Run `npm test` (Node 22.13+ for the SQLite test adapter). Tests execute the production parser, frontend helper source and D1 reservation SQL. They cover malformed output, unknown colors, official URLs with dangerous content, quotas, timeouts, shared concurrency, Gemini privacy boundaries and QR results surviving OCR failure. Mock-provider tests validate control flow, **not** real-world model accuracy. Before changing models or enabling a backup, evaluate consented, de-identified Traditional Chinese fixtures and measure false-positive/false-negative rates.

## Official references

- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Llama 3.2 Vision model and license requirements](https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/)
- [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini API additional terms](https://ai.google.dev/gemini-api/terms)
