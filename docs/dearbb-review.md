# Dear BB Design review

Reviewed: 2026-09-12

Target: https://dearbb.design/

The site identifies itself as Dear BB Design, selling customized gifts, with
contact information and order lookup. Footer attribution is 日光生活文創有限公司.
This is site-provided identity, not an independently verified registration.

Sources:
- https://dearbb.design/contact
- https://dearbb.design/find-order
- https://lotuslin.com/blog/post/2025dearbbdesign
  A dated 2024-10-25 product introduction corroborates historical brand activity;
  such promotional/editorial material is not proof of transaction safety.
- https://weiyucc.pixnet.net/blog/post/346086682
  A 2024 introduction links www.dearbb.design and the brand social accounts.

Production reproduction: 95/high. The principal trigger was 富邦銀行 brand
impersonation. Direct HTTPS HTML inspection found 台北富邦銀行 as image alt
text in a customer-logo list, with path /images/home/client-logos/fubon...webp.
This is not itself a claim that the shop is a bank. Other shopping, LINE, and
domain-name heuristics also appeared. Google/official alerts did not match.

Use existing exact-host conditional trust for dearbb.design only. Do not
extend to test.dearbb.design or all .design sites. Do not globally exempt
customer-logo claims (attackers can also add them), invent a tax ID, or
bypass strong threats. Content/Google unavailability still yields unknown.
Regression coverage includes the observed brand signal and threat overrides.
