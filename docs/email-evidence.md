# Screenshot Email Evidence

`email-risk.js` is shared by the browser and the vision endpoint. It contains a small, sourced sender registry, local line extraction and deterministic combination rules. No new API key or database is required.

## Registry

There are eight initial references: FETC/eTag, Taipower, Chunghwa Telecom, Motor Vehicle Driver Information Service, Cathay United Bank, Chunghwa Post, 7-ELEVEN MyShip and Shopee. These cover examples of billing, telecom, traffic, banking, delivery and marketplace services, not every brand in those industries.

Only FETC and Chunghwa Telecom currently have sourced sender-domain entries. Their official electronic-bill pages publish `FETCService@fetc.net.tw` and `cht_ebpp@cht.com.tw`. This establishes known sender domains, not exhaustive lists or authenticity guarantees. The other six sender lists are intentionally empty: `no_sender_reference` cannot activate the sender-mismatch rule. Website trust lists are not reused as sender authorization.

Each brand has aliases, a category, exact website references, separate short-link references, sender domains, separately verified delegated domains, purpose, source links and verification date. `includeSubdomains` defaults to false. Known root/www pairs are explicit website entries, not sender aliases. Chunghwa Telecom's FAQ documents `cht.tw` billing links; Cathay's anti-phishing page documents `cathaybk.tw` and links to its CUBE/investment sites. These do not authenticate a screenshot or resolve a short link. Only add a delegate with independently verified evidence; do not infer it from a suspicious message. Review entries within 366 days; stale/future-dated records cannot activate branded rules. The registry is intentionally not an email-provider blacklist.

All matching brands are returned. Multiple brands result in `ambiguous_brand`; the evaluator does not arbitrarily select the first brand for a sender/website mismatch. Strong brand-independent behavior rules still apply. Source URLs refer to public guidance, not a verification of the specific uploaded message.

## Extraction And Rule

OCR lines retain their individual confidence and original line number. Lines below 80/100 are not evidence. The text-only OCR fallback uses overall confidence when the engine supplies no line data. Ambiguous sender/recipient labels on the same line abstain. Labels separated from addresses by unreadable lines cannot establish a sender role.

OCR-inserted horizontal spaces between Chinese characters and within email separators are normalized without guessing letters or missing dots. At most two malformed email lines are cropped in memory, enlarged, contrast-normalized and reread with English OCR. A domain is accepted only at confidence >= 80; when symbol data is available, every domain character must meet that threshold independently of the private local part. Low-confidence or ambiguous domains remain unverified. Malformed `@` tokens are excluded from URL extraction, so a local part such as `redacted.name` is not mistaken for a website.

Returned evidence includes brand references, sender/recipient/body domain roles, subject line locations, behavior signals, TWD amounts, visible URL hosts and whether a plate is visible. Matched rules include stable IDs, descriptions, original OCR line numbers and reference links. Full email local parts, private names, exact plates, URL paths/query values and raw OCR text are not retained in the assessment or written to the AI database. The existing URL scanner separately receives full extracted URLs under its existing audit policy. Amount and absent plate are never independent risk triggers. An absent plate means only **not visible in this excerpt**, not absent from the full email.

Four brand-independent combinations work locally, including for unknown brands:

| Rule | Required combination |
| --- | --- |
| `message-secret-handoff-v1` | Service/account context plus an explicit request to send a password/OTP to someone; entering an OTP in one's own app alone does not qualify |
| `message-atm-cancel-installment-v1` | Cancel installments/duplicate debits plus a request to operate ATM/online banking |
| `message-seller-advance-payment-v1` | Seller/payment activation or verification plus an explicit advance-transfer/security-deposit request |
| `message-financial-remote-control-v1` | Billing/account/refund problem plus a request to install/enable remote-control software |

These combinations require reliable positive clauses, with the required signals near one another (within five original OCR lines of an anchor). Negative instructions such as "do not send an OTP" are excluded at clause level. A negative footer does not suppress a separate positive request. URL paths/query strings cannot supply behavior keywords, and URL punctuation is not treated as a sentence boundary. Explicit opening educational headings abstain. This is bounded heuristic context handling, not full natural-language understanding.

`message-brand-external-card-v1` additionally requires a single freshly referenced brand, a billing/refund/traffic/delivery/account problem, a visible HTTP(S) URL in the same clause as a positive link/action request whose hostname is absent from the reference list, and an explicit request to fill in card details. It reports **suspected** impersonation, not proof that an unlisted host is malicious. Footer URLs, email domains, unseen button targets, unlisted hosts alone and low-confidence evidence cannot activate this rule. Incomplete brand data and newly authorized payment providers remain possible false-positive sources; review new reports before changing reference data. It does not automatically blacklist hosts.

`mail-brand-unlisted-payment-login-v1` requires all of:

- A recognized brand with current reference data.
- A confidently read sender or brand-adjacent claimed-sender domain absent from verified records.
- A visible payment-failure/arrears statement.
- A visible request to log in, verify an account or confirm billing information.
- No explicit opening education/example heading.

The result is **high risk, suspected impersonation**, not confirmed origin fraud. A listed sender is not marked safe; the screenshot cannot establish SPF, DKIM, DMARC or the actual link destination. Body/recipient addresses do not count as sender mismatch evidence. A generic fraud-warning footer does not exempt a message. This rule is a heuristic, including its education-context recognition, not protection against every adversarial layout.

## Integration

### Prize And Credit-Card Verification

`message-prize-card-verification-v1` flags invoice-prize or pending prize-payment
claims combined with an instruction to use a linked/named system to verify a
credit card's validity or supply card details. The two signals must be nearby;
each may span up to three consecutive reliable OCR rows. Negative advice,
opening education headings, isolated prizes, isolated card notices and
low-confidence text do not establish this combination.

This is a high-risk phishing heuristic supported by CPC's public warning:
https://www.cpc.com.tw/News_Content.aspx?n=30&s=112090
It does not infer an official sender whitelist, authenticate the sender, or
claim the hidden hyperlink destination has been extracted. Neither `.nl` nor
Traditional Chinese alone affects risk. Brand names and sender domains can
change without bypassing this behavior rule.

When reliable prize and card evidence already exist, at most two low-confidence
instruction lines receive local contrast-adjusted Chinese OCR retries. A single
complete line with confidence >=80 is required; no cloud AI is called. The
report recommends independently checking official invoice services rather than
following the email or supplying card details.

On 2026-09-18, real local Tesseract testing of the supplied CPC screenshot in a
mobile Chromium viewport produced a visible high-risk prize-phishing report.
The blue instruction line initially fell below the threshold; the contrast
retry exceeded 80. OCR still misread one character in the system name, but the
rule depends on the reliably read instruction and adjacent card/prize context,
not an exact brand match. This is a single-image regression, not an accuracy
benchmark. Neither the image nor private email addresses are committed.

### Partial Billing Notice Warning

`mail-brand-unlisted-payment-warning-v1` records a separate `senderWarning`
when a current brand sender reference, reliable unlisted sender and payment
failure are visible but no high-risk combination is established. It keeps
`risk: unknown`, sets `needsContentReview`, and explains suspected brand
impersonation and how to verify independently. A login request can still
activate the existing high-risk rule. The warning never creates a blacklist.

Country-code suffixes do not affect this rule: an unlisted `.com.tw` is treated
the same as `.nl`; a verified delegated `.nl` sender does not trigger it.
TLS is explained as transport encryption, not authentication. Recipient/body
addresses, truncated addresses, ambiguous brands and stale references abstain.
Only domains, rule IDs and evidence line numbers appear in structured warnings.

Sender-labelled rows take priority within the existing two email OCR retries.
For an unlisted sender, at most two low-confidence payment-failure lines can be
cropped and reread locally with Chinese OCR, preserving the left edge and any
negation. Only a single complete reread line at confidence >=80 is accepted.
No cloud AI or image upload is used. Main and chat reports preserve this warning
over an unknown website assessment, while high-risk evidence retains priority.

On 2026-09-17 the supplied dark-mode FETC email screenshot was tested with real
local Tesseract in mobile Chromium. The sender field recovered `home.nl`; the
payment-failure line initially had confidence 64.8 because of adjacent UI, and
the contrast-adjusted Chinese crop reached 85.9. The visible report showed the
suspected-impersonation warning, not high risk. OCR still inserted an extra
character, tolerated by the existing bounded phrase matcher. This single sample
is not a general accuracy claim. No private image or raw email was committed.

Main upload and chat execute local assessment and display a report whether high
or unknown. Images never call cloud AI, automatically or manually. The old vision
endpoint returns HTTP 410 before reading uploads. Screenshot-derived URLs use
non-AI scans, including resolved shortlink destinations, without replacing
content warnings. Distinct URLs on consecutive lines are not concatenated.

Main results support crop/re-OCR and editing recognized text. Original high-risk
evidence survives either operation. User edits carry a provenance label.
Image messages and local reports are excluded from later text-chat API history.
Ordinary text chat retains the existing free-only gate and budget; no provider,
key, paid fallback or billing change is enabled. See screenshot-ai.md.

Tests use de-identified text rather than the user's screenshots. Run npm test.
They cover source roles, delegated senders, stale records, educational context,
local-only main/chat flows, cancellation and evidence retention after edits.
Pure legacy vision parsers remain for evidence regression testing, but are not
used by the disabled endpoint. OCR accuracy still depends on image quality.

Browser regression check after building:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/check-screenshot-preview.cjs.
It tests the production frontend at desktop/mobile widths with synthetic OCR,
images and scan results. It asserts zero image-triggered AI calls, local editing,
crop pixels and no overflow. It is not an OCR accuracy benchmark.

## Reference Maintenance

Keep references in `email-risk.js` so browser and server share one version without external lookups per upload. For each update: verify an official source, distinguish website ownership from sender authorization, record purpose/date/scope, add normal and fraudulent de-identified regression cases, and bump the two script cache keys in `index.html`. Never auto-promote user submissions to trusted or blocked records. Do not commit raw screenshots or personal data as fixtures.

Next evaluation work should use consented/de-identified real images, include legitimate bills and fraud-warning articles, and split evaluation by message template rather than randomly mixing near-duplicates. Track false positives, misses and abstention separately; the deterministic test suite does not establish a population-level accuracy rate. Template clustering and new OCR engines are deferred until this baseline is measured.

On 2026-09-05, the supplied original eTag screenshot was tested locally with real Tesseract OCR in a mobile Chromium viewport. Initial OCR lost the domain dot; region rereading and domain-character confidence recovered `upcmail.nl`, triggering the high-risk combination without any cloud API request. No original image or private screenshot was saved as a fixture. This is one successful sample, not a measured general accuracy rate.
