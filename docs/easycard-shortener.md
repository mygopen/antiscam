# EasyCard official shortener

Reviewed: 2026-09-09

Official corroboration of link.easycard.tw:
https://www.easycard.com.tw/_upload/files/QRTPE202605.pdf
https://sup.moenv.gov.tw/news/561121d1-8e02-4404-a5d8-af46f9c9a5e6

Observed https://link.easycard.tw/8v7hsb redirecting to
https://epkaw.easycard.com.tw/home and then the same official hostname's app
deep-link landing page. Do not hard-code opaque deep-link parameters.

Before correction the live result was 100/high, with financial-phishing text
as the reason, despite no Google or official alert match. The shortener and
official destination were absent from configuration. Register the shortener,
its official destination family, and the reviewed service domains. Keep final
destination scoring, unknown unresolved results and strong-threat overrides.
Do not trust lookalikes or unrelated destinations merely because the entry is official.
