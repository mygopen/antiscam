# WFP donation domain review

Reviewed: 2026-09-11

- Organization: United Nations World Food Programme (WFP).
- Official sources: https://www.wfp.org/ and https://www.wfp.org/support-us
  identify WFP and its individual donation programme. Search results could
  retrieve these sources, while direct web-tool requests returned HTTP 403.
- Reviewed target: https://donate.wfp.org/zh-hans/1244/donation/single/
  It is a subdomain of WFP's official `wfp.org`, not a similar-looking domain.
- Direct HTTPS retrieval succeeded with certificate verification enabled.
  HTML title: 立即捐赠 | 联合国世界粮食计划署. The page uses Nuxt and
  references PayPal and Stripe resources. No donation or personal information
  was submitted. This does not verify every subsequent payment interaction.
- Production reproduction of the supplied advertising URL returned score 0,
  `unknown`, due to incomplete page content. Advertising parameters were
  informational, not a high-risk trigger. No high-risk verdict was reproduced.

Add `wfp.org` to the public-interest trust list and only `donate.wfp.org` to
the exact-host manual content baseline. Keep raw content availability and
manual-review disclosure; do not fabricate Taiwan registration records.
The existing query sanitization and raw-URL audit handling remain unchanged.
UTM placeholders and fbclid alone do not establish fraud or authenticity.

Regression tests cover clean and tracking URLs, missing content, lookalikes,
unreviewed subdomains, Google unavailability, and strong-threat overrides.
Blacklists and confirmed threats still take priority over trust.
