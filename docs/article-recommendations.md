# Local MyGoPen article recommendations

Updated: 2026-09-15

## Scope

P1 adds the work/group/QR-return/isolation combination to email-risk.js and
five source-checked MyGoPen articles. P2 adds deterministic weighted Chinese
phrase ranking with curated synonyms, OCR wrapping, proximity windows and
deduplication. This is a bounded local catalog search, not a live search of
all MyGoPen posts, not embedding retrieval, and not generative RAG.

The catalog and matching logic live in article-search.js. Build emits a hashed
local asset loaded before app.js. No search service, cloud model, vector store,
login, new database, scheduled workflow or additional paid resource is used.
Do not pass raw OCR, screenshot data, result reports or search phrases to APIs.
Existing screenshot URL checks remain independent and non-AI.

## Independent decisions

- Risk is determined only by EmailRisk. Recommendations never mutate risk.
- The new high-risk rule requires work context, a LINE group creation request,
  returning an invitation QR/code by email, and limiting other participants.
- The isolation instruction is deliberately not treated as generic negative
  safety advice. Ordinary invitations and explicit educational examples are
  regression fixtures. The heuristic does not authenticate the sender.
- Article relevance requires multiple distinct concepts within eight OCR rows.
  Only rows with confidence 80-100 participate. Adjacent row wrapping is allowed;
  unreadable gaps cannot manufacture phrases. URLs/email addresses are excluded.
- Each matched concept contributes its weight once. A matching evidence rule
  adds a ranking bonus but cannot bypass required topic concepts. Repetition
  cannot inflate scores. Equal scores sort by publication date then stable ID.
- At most three unique canonical MyGoPen URLs are returned. Low relevance,
  missing library, unreviewed/withdrawn records and reviews older than 366 days
  produce no recommendations. The catalog must be reviewed before that expiry.
- UI shows title, publication date, matched concept labels and a caveat that
  similar cases are not verification of this message. No similarity percentage
  or user identity is displayed as evidence. Educational material can receive
  related reading without being classified as an active scam message.

## Integration

Main OCR and corrected text recompute recommendations. A fresh upload, crop or
failed OCR clears old recommendations. Previously discovered high-risk evidence
is still retained according to screenshot-ai.md, independently of the new list.
Main report copy includes the currently recommended titles and canonical links.
Chat renders clickable recommendations alongside localOnly image reports;
they are excluded from later text-chat requests by the existing serializer.

## Catalog maintenance

Each entry needs a stable id, editorial display title, canonical article URL,
publication date, review date, status, topic tags, associated rule IDs, required
concept IDs and synonym groups with weights. Display titles may be shortened;
they are not generated from the screenshot. Current records were checked against
their published pages on the review date, not auto-ingested or user-submitted.

To add/update a case:
1. Read the original article and check corrections and factual scope.
2. Add or update the reviewed record. Never copy private screenshot text,
   names, addresses, invitations or complete article bodies into the index.
3. Use at least two specific concepts. Do not recommend on LINE, QR or a brand
   alone; add paraphrases and normal/educational counterexamples to tests.
4. Set status to withdrawn to stop a recommendation immediately in the next
   release. Article withdrawal does not remove risk rules automatically; review
   their source and tests separately.
5. Run npm run build:verified and the screenshot browser regression before
   committing/pushing. Existing Git-triggered deployment publishes the index.

## Evaluation

tests/article-search.test.js covers template/phrase variants, educational and
legitimate messages, low confidence, URL-only keyword injection, confidence gaps,
ranking, duplicate/capped results, dates and withdrawal. The browser regression
checks main and chat rendering at 1280px/390px with zero image-triggered AI calls.
Synthetic text tests do not establish real-world OCR accuracy or recall across
unindexed scams. Expand the reviewed catalog from de-identified cases and track
false recommendations and missed recommendations separately from risk errors.

On 2026-09-15, the supplied original work/group email screenshot was processed
with real Tesseract English/Traditional Chinese OCR in a UTF-8 local browser
harness. It matched message-work-group-qr-v1 and recommended email-qrcode.html,
with zero upload POST requests. The image was not committed or retained as a
fixture. This is one successful case, not a general accuracy measurement.
