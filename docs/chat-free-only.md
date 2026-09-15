# Free-only chat

Updated: 2026-09-15

## Production activation gate

Chat inference defaults OFF. FAQ replies and URL scans remain available.
`CHAT_AI_FREE_ONLY_CONFIRMED=true` may only be configured after an operator
verifies the serving account uses Workers Free (platform-enforced stop at the
free allocation) without paid AI Gateway credits/routes. This flag is an
operator attestation, not an API that verifies billing. Remove it before any
account plan change. Do not set it on Workers Paid merely because estimated
usage is below the allowance; account-wide usage can exhaust the free tier.

The Cloudflare subscription API returned authentication error during this
change. No free-plan confirmation was set; production chat stays fixed-only
until billing configuration is verified. No account downgrade was attempted.
This change does not disable the separate vision/brand-analysis endpoints or
change their provider policies. It guarantees no chat inference while the
gate is closed, not a zero invoice for every Cloudflare service.

## Quota handling

- No new model, paid fallback, retry or speculative model comparison.
- Pinned chat model: @cf/meta/llama-3.1-8b-instruct-fp8, maximum 80 output tokens.
- Last three validated messages plus the system prompt; 6,000-character input
  validation remains. FAQs are matched narrowly and return before DB/AI calls.
- Estimate input from UTF-8 bytes plus template overhead; reserve with the
  published input/output neuron rates, 25% margin and fixed overhead. These
  reservations are conservative estimates, not billing measurements.
- Chat, vision and brand analysis retain the shared atomic 8,000 maximum
  internal daily allowance. No refunds from missing token accounting.
- Missing storage, invalid budget, quota and rate restrictions fail closed.
- Cloudflare quota errors hold the shared circuit until next 00:00 UTC
  (08:00 Taiwan), with no same-day automatic retry after quota exhaustion.
- No conversation text is added to persistent budget logs; no shared response
  cache is introduced for private conversations.

Pricing reference: https://developers.cloudflare.com/workers-ai/platform/pricing/

## Candidate evaluation (not run against an API)

After the Free account gate is verified, evaluate Qwen3 30B A3B on the same
questions within the shared budget: requests for OTPs, fake bank messages,
uncertain URLs, refund scams, greetings, and unrelated topics. Compare Taiwan
Traditional Chinese, unsupported safety claims, output truncation, latency,
and reported usage. Confirm reasoning controls and pricing before enabling.
Never run candidates in parallel on live user questions or fall back to paid
models. Existing tests mock all inference and incur no model fees.
