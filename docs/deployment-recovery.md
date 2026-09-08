# Deployment recovery (2026-09-08)

The 2026-09-07 22:14 UTC analytics sync commit triggered a Git deployment
while the Pages build command and output directory were both empty.
The source index requested nonexistent /assets/app.js (and other assets).
Pages returned its HTML fallback with HTTP 200, which the browser cannot
execute as JavaScript. A successful homepage HTTP response is insufficient.

The tested precompiled site was restored with Wrangler. The four data-sync
workflows temporarily use [CF-Pages-Skip] so they cannot replace the site
with unbuilt source. Data still syncs into Git and is included in the next
direct deployment; it is not published automatically during this mitigation.

The existing antiscam Pages project was corrected through the authenticated
dashboard on 2026-09-08. The saved settings were confirmed through the API:

- Build command: npm run build:verified
- Build output directory: dist
- Root directory: repository root

The connector can read settings but cannot currently update them; the dashboard
was used to save them without retrieving OAuth credentials manually. This
commit verifies the corrected Git deployment path. After a successful Git
build and live check, remove the temporary skip prefix from all four sync
workflows.

After each deployment, run:

```sh
node scripts/check-deployment.cjs https://check.mygopen.com/
```

This checks hashed asset references, HTTP status, MIME types, nonempty content,
and JavaScript syntax. Also verify that the application renders in a browser.
The static root message remains visible if JavaScript cannot start.
