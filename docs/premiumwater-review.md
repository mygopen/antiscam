# Premium Water Review

Reviewed: 2026-09-18

Targets: https://premiumwater.com.tw/ and https://www.premiumwater.com.tw/
The root redirects to www. The storefront identifies itself as 極淨水 and
publishes 奕尚 / 秦佑企業有限公司, tax IDs 16895617 / 28902846, contact
details, warranties, shipping and return policies. These are site claims,
not proof of every transaction's safety.

Sources:
- https://www.premiumwater.com.tw/
- https://www.104.com.tw/company/7rf7pig
- https://api.1111.com.tw/corp/67002485/

The recruitment profiles corroborate the company/brand and website association.
The existing live registration check returned 16895617 as 奕尚企業有限公司,
核准設立, but did not establish domain ownership. No registration mapping or
invented official-domain verification is added by this change.

Reproduction using the production scan core and live non-AI services returned
high risk / score 70. The dominant reason was public-utility impersonation:
`fakeServiceKeywords` included the generic substring `water`. Google Safe
Browsing and official alerts did not match. The page also had generic shopping
heuristics; these are not independent proof of fraud.

Remove `water` as a standalone impersonation keyword, rather than exempting all
water-related sites. Existing sensitive form, blacklist, utility-scam context
and brand-specific checks remain. Add only the two exact reviewed storefront
hosts to conditional trust. Unknown subdomains, lookalikes and external
destinations are not trusted. Content or threat-check unavailability remains
unknown, and strong threats still override trust.
