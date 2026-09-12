# Risk calibration (2026-09-12)

This update changes shared rules, not additional per-domain allowlists.

- A protected brand mentioned in page content remains recorded, but only
  page-identity (title/H1/site-name) or a brand-associated credential form
  triggers the brand-impersonation rule. A mention must not hide a later
  stronger brand match. Existing legacy signals without evidenceLevel retain
  their previous treatment for compatibility.
- Shopping features plus low traffic, entropy or advertising parameters alone
  no longer trigger the shopping-scam rule. It now needs a suspicious temporary
  host, sensitive external form, very new shop lacking merchant information,
  or external form with high-risk fields. Other independent threat rules remain.
- At least three years since RDAP creation reduces low-traffic and derived
  disposable-name signals. Paid registration duration and TLS issuance are not
  substitutes. Shared-hosting parent ages are excluded.
- At least five years additionally permits a 25-point ceiling only with
  matched public/registrant business identity, mature SEO, ecommerce evidence,
  readable content, resolved destination and no blocking threat. This is not
  evidence of uninterrupted business operation. No archive history is invented.
- Content/Google unavailability remains unknown under the existing final policy;
  explicit reviewed-host baselines remain separate. Strong threats retain
  priority and revoke the displayed maturity benefit.

Initial three/five-year thresholds are conservative product policy, not a
universal security standard. No new paid API, model call or external service.
Regression tests cover positive/negative age controls, shared providers,
brand context, ordinary shopping, threats and malicious short-link destinations.
