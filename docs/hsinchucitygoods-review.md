# Hsinchu City Goods domain review

Reviewed: 2026-09-08

- Domain: hsinchucitygoods.com (including www).
- Identity: 2026 Hsinchu market event (竹風好市集).
- Public corroboration: https://www.cna.com.tw/postwrite/chi/443450
  The September 7 event announcement explicitly links this exact website.
  This is CNA's contributed press-release platform, not an independent investigation.
- Website: https://www.hsinchucitygoods.com/
  The event has voting and prize activities; its login link goes to
  https://access.line.me/. This alone does not establish safety of every page.

Use the existing trusted Taiwan service domain mechanism to suppress weak
heuristic false positives. Do not infer a business registration or tax ID.
Domain-boundary matching must reject lookalikes and suffix attacks. Existing
strong threat overrides and incomplete-check handling remain in force.

Root cause: the extreme-gibberish flag used only a 15-50 character length
pattern. It marked the entropy check dangerous even when the high-entropy
flag was false and its description said the name was normal. The final
consistency pass then raised the score to 70. Require the existing randomness
signal as well as length, matching the scoring branch. Regression coverage
removes the trusted mapping to ensure this fix is not merely an allowlist bypass.

## Voting page follow-up (2026-09-10)

- Reviewed https://www.hsinchucitygoods.com/vote directly over HTTPS and
  inspected its rendered DOM without logging in or casting a vote.
- Title: 2026竹風好市集|嚴選商家. The visible input is a brand search;
  five other inputs are hidden, including a token. No password or OTP input
  was present in the inspected page.
- Login anchors target `https://access.line.me/oauth2/v2.1/authorize`, with
  `redirect_uri=https://www.hsinchucitygoods.com/linecallback.php`.
  This is an observed authorization link, not a guarantee of every later step.
- Production reproduction returned score 0, assessment `unknown`, because
  content inspection timed out. No high-risk verdict was reproduced.
- Add only the exact reviewed host `www.hsinchucitygoods.com` to the existing
  manual content baseline. Keep raw content availability and the manual-review
  disclosure. Do not extend the baseline to unreviewed subdomains.
- Google unavailability still produces `unknown`; blacklist, official alerts,
  and direct LINE credential collection still override trust to high risk.
  General voting/phishing detection remains unchanged.
