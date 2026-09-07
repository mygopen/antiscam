# Health review fixes 1-6 (2026-09-07)

## Result policy

`scan-policy.js` is shared by the main result, chat and copied report. Unresolved
shorteners, unavailable page content and an incomplete Safe Browsing query yield
an unknown assessment, not a green safety conclusion. Strong threats still win
over missing information. Technical scores remain available independently.

Trusted domains (including government domains) reduce weak heuristics, but cannot
suppress blacklist matches, reviewed malicious domains, official alerts, supported
Cofacts threats, Google threats or dangerous redirect traces. Sensitive fields
combined with external form submission also revoke the trusted override. Trusted
commerce pages now undergo content inspection instead of skipping it entirely.

Safe Browsing reports clear, matched, disabled, timeout or unavailable explicitly.
Only a successful validated response can count as clear. HTTP error pages are not
used to assess missing security headers.

## Outbound fetching

`functions/lib/public-fetch.js` is used by content, headers, SEO, tracing and brand
analysis. It validates each redirect, rejects credentials, nonstandard ports,
private IPv4 and IPv6 literals, checks A/AAAA answers, limits redirects, body bytes
and request duration. Brand analysis no longer runs arbitrary page JavaScript in
Browser Rendering. Frontend third-party content proxy fallbacks are separate and
do not bypass the server-side helper.

DNS checks fail closed. IPv6 literals are deliberately unsupported; ordinary DNS
hosts with globally routable IPv6 answers are allowed. DNS preflight and Workers
fetch are not an atomic pinned connection: protection against an adversarial DNS
change between those operations also depends on platform egress isolation. This
is not a claim of complete DNS-rebinding protection.

## AI and rate limits

Brand analysis no longer invokes unbudgeted Gemma or Browser Rendering. It shares
the existing Workers AI daily reservation, concurrency and circuit breaker with
chat and vision (400 reserved units per brand attempt). Existing Gemini image
fallback settings are unchanged. No billing or new paid provider is enabled.

Apply `migrations/0002_request_limits.sql` to the existing AI_BUDGET database before
releasing. Missing tables/bindings fail closed. Brand requests are limited to five
per client per minute using short-lived hashed identifiers; raw IPs are not stored.
Expired counters are cleaned opportunistically. Successful brand responses have a
five-minute Cloudflare cache under a hashed URL key; this is separate from the AI
audit database and can include the queried URL in response metadata. No screenshots
or OCR text are added to this cache. Responses to clients use Cache-Control no-store.

The application budget is conservative, not a provider billing guarantee, and is
shared with existing chat/vision calls. Budget rejection must be shown as incomplete
analysis, never a clean bill of health.

## Validation and release

- `npm test` exercises the production policy, Safe Browsing states, DNS/redirect
  rejection, bounded reads, brand limits and shared budget.
- Compile app.js with esbuild's JSX loader, then run
  `node scripts/check-health-core.cjs /absolute/path/to/compiled/app.js` to test the
  actual production scoring flow against controlled IO fixtures.
- `node scripts/stage-pages.cjs /new/absolute/staging/path` includes only public
  assets and Pages Functions, excluding local photos, tests, repository data and
  credentials. Deploy that directory to the existing antiscam Pages project.
