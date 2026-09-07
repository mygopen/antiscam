# Short-link abuse warnings

- MyPPT is recognized as a shortening/hosting service, not a trusted destination.
- The main result, chat response, and copied report warn that scammers can abuse shortening or file-hosting services. This notice alone does not increase the risk score.
- Unresolved links remain unknown unless independent risk signals or a specific reviewed report justify a high-risk response.
- `reportedShortLinks` stores case-sensitive hostname/path matches. Query parameters do not change the identity of the recorded short code. The report is retained even if the destination later changes; reviewers should re-evaluate or remove it when resolved.
- `myppt.cc/c310jT` is a user-reported suspected fake drawing contest. It receives precautionary high-risk treatment; its destination was blocked by HTTP 403 and has not been independently verified. No provider-wide block is added.
- The page rule requires a voting/contest context and a form that identifies itself as LINE while directly collecting passwords or verification codes outside HTTPS `access.line.me`. Ordinary contests, hosted pictures, and links to OAuth are not automatically high risk. LINE contact text outside an unrelated password form is not strong evidence.
- Image-only activities still depend on the existing screenshot OCR workflow; this release does not invent invisible links or bypass authentication/CAPTCHAs.
- Regression tests cover case-sensitive codes, different destinations, normal provider usage, blocked links, credential forms and legitimate OAuth.

## Release

Until Pages Git build settings are corrected, use the documented `[CF-Pages-Skip]` commit prefix to omit only the old Pages build. GitHub tests remain enabled. Run `npm run build:verified` and deploy the staged built assets directly. This does not change account permissions, secrets, or existing bindings.
