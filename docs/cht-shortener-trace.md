# CHT shortener trace regression

Verified on 2026-09-07 with GET requests:

`https://cht.tw/x/b0rts` -> `https://chts.tw/zymXVy` ->
`https://www.cht.com.tw/home/campaign/msecuritygo2` (campaign tracking parameters omitted here).

Official references:

- https://www.cht.com.tw/home/consumer/customer-service/announce/antitelefraud
  identifies `cht.tw` as an official domain.
- https://www.cht.com.tw/zh-tw/home/cht/messages/2022/1102-1050
  publishes a `chts.tw` campaign link.

The original trace handler reproduced a false positive: mobile completed the two
redirects, while desktop failed to fetch the intermediate `chts.tw` URL. Comparing
these as two final destinations set `uaDifference` and `isHighRisk` to true.
The intermediate failure was also incorrectly marked `resolvedDestination: true`.

Only completed traces now participate in destination comparison. Prefer a completed
profile as the primary result, but retain dangerous redirect evidence from either
profile. Incomplete comparisons remain visible as warnings, not a claim that both
devices reached the same destination. When neither trace completes, the frontend
keeps the shortener unresolved rather than scoring an intermediate hop as final.

Both shortener domains have a destination policy for `cht.com.tw`. This does not
allow arbitrary external destinations or treat the intermediate shortener as proof
of safety. Live destinations can change; these observations are not a permanent
guarantee for the specific URL.
