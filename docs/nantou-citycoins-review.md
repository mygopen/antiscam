# Nantou Citycoins portal review

Reviewed: 2026-09-11

Target: https://portal.nantou.citycoins.cc/ (點點投)

Official corroboration: Nantou County Government Planning Department directly
links https://portal.nantou.citycoins.cc/stores in its partner-store listing:
https://www.nantou.gov.tw/big5/bureau/news_content.php?cid=3714&dptid=376480000au210000&id=163822

Production reproduction returned 100/high, attributing the page to Apple.
Direct HTTPS HTML inspection showed a Nuxt client-rendered shell titled 點點投,
with apple-mobile-web-app-capable/status-bar-style meta names and an
apple-touch-icon link. The brand scanner matched these technical attributes
as Apple identity claims. No login or transaction was performed.

Strip only the known PWA attribute names/relations from brand-analysis input
using the DOM parser, retaining content, href, and actual Apple text. Regression
tests use an untrusted host so they do not rely on the new trusted mapping.

Trust only portal.nantou.citycoins.cc and add its manual content baseline for
the JavaScript shell. Do not trust the shared citycoins.cc parent or other
tenants, label this as a gov.tw domain, or invent registration data. Strong
threats still override trust; unavailable Google checks still yield unknown.
