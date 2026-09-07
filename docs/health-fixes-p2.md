# P2 Health Fixes (Audit Items 7-9)

## Source Disclosure

- Cofacts responses separate active manually reviewed records from synchronized records.
- Sync state is `disabled`, `ready`, `stale` (older than eight days), or `unavailable` (invalid/missing timestamp). A current empty index is not treated as disabled.
- Responses retain the original attribution, article links, review date, sync date, and incremental query start when known. Match provenance is `manual` or `synced`.
- The report states that lookup covers only the collected index, not a live search of the entire Cofacts service. Failed/disabled/stale no-match checks are unknown, never safe.
- This release does not enable unapproved Cofacts API synchronization or manufacture an update timestamp. Historical matches remain evidence, with their source age disclosed.

## Production Core and Regression Tests

- `scan-core.js` contains the production URL parsing, page analysis, scan orchestration, scoring, and final consistency functions. The UI and tests use this same factory.
- Tests inject only network/HTML acquisition boundaries. They no longer compile and rewrite the application source to replace functions.
- Legacy URL helpers and finalizers now call the production core. Official-domain baseline cases are separate from Google/blacklist conflict cases; neither government nor company identity overrides a confirmed strong threat.
- The core suite covers unavailable providers, blocked pages, unresolved shorteners, malicious final destinations, trusted-domain conflicts, and conditional company trust revocation.
- Some older specialized signal fixtures remain supplementary tests. They are not substitutes for production-flow tests.

## Build and Accessibility

- React 18.3.1 is served locally; esbuild compiles JSX and Tailwind 3.4.17 generates static CSS before release. Direct dependencies and the full dependency tree are pinned in `package-lock.json`.
- Built assets have content hashes and immutable caching. HTML is revalidated; no Babel/Tailwind compiler is downloaded at runtime.
- `npm ci`, then `npm run build:verified` runs the full suite and creates `dist/`. Build tests also check asset completeness and private-file exclusion.
- Cloudflare Pages Git configuration: build command `npm run build:verified`, output directory `dist`, project root unchanged. Pages Functions remain in the repository's `functions/` directory.
- Direct deployment: `node scripts/stage-pages.cjs /absolute/new/staging-dir`, then `wrangler pages deploy /absolute/new/staging-dir --project-name antiscam --branch main`.
- The staging command copies only built public files and Pages Functions. Never deploy the repository root.
- Page zoom is enabled. The URL input has one focus handler, an accessible name, URL keyboard hints, and blur cleanup. Upload is a keyboard-operable button. Technical-report controls expose expanded state and wrap on narrow screens; unknown checks use neutral styling.
- Existing screenshot OCR, QR parsing, and mail analysis remain available. This release does not add RAG, a case administration backend, or new paid services.

## Validation

- Node regression suite and production build.
- Browser checks at desktop, 390px and 320px: page renders, scan completes, source state visible, no overflowing report buttons, upload reachable via Tab, and no browser JavaScript errors.
- Mobile viewport emulation does not replace physical iOS/Android keyboard or screen-reader testing.
