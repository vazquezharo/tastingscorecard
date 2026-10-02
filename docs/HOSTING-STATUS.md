# Live hosting

- App: https://tasting.haroldvazquez.com
- Host screen: https://tasting.haroldvazquez.com/host
- Vercel team: `vazquezharos-projects`
- Isolated project: `blind-tasting` (`prj_tDoUMDOwQ6kSQ2lpMtImv9LQyAVE`)
- Database: `blind-tasting-db`, dedicated Neon PostgreSQL resource `store_CApDlPv64NpAB3HY`, free plan `free_v3`, `iad1` region, no provider guest authentication
- Runtime: Node.js 24, with API imports targeting compiled `.js` files
- Domain: verified under the existing Vercel-managed DNS; HTTPS and public guest access work without Vercel account login
- Credentials: server-side production environment variables only; private host-password handoff at `/workspace/tasting-host-password.txt`, outside the source/upload directory

The existing `haroldvazquez` and `ai-sommelier` projects were not edited. Apex, www and existing service domain assignments were preserved. The main coaching homepage was checked after deploying.

The local `.vercel/project.json` links only this new project. For later deployment, run Vercel CLI from this directory with the `vazquezharos-projects` scope and verify the linked project is `blind-tasting`. Preserve the database and existing environment variables. Never regenerate secrets as part of an ordinary redeploy.

Hosted verification used separate Chromium contexts against the final domain, backed by live PostgreSQL. A second live API rehearsal verified actual PostgreSQL row-lock concurrency, scoring ties, exact final-domain QR content, answer secrecy, locking and CSV export. Events are explicitly named Demo/DEMO and can be used to review results; create a fresh event for the real tasting.

An initial function import-path error was corrected before successful hosted verification. The managed browser did not trust the environment proxy certificate. Automatic approval review rejected adding that certificate to its persistent trust store because it would affect future TLS verification; no trust change was made. Hosted browser requests instead used the environment’s existing Node-trusted HTTPS client with TLS verification enabled, and the same production responses were rendered in isolated browser contexts. Physical phones and camera scanning remain untested.

The Vercel CLI authentication is stored outside the app source. `.vercelignore` excludes all local environment files, the rehearsal SQLite database and test artifacts. Source archives exclude deployment credentials and host passwords.

Latest verified production deployment: `dpl_Bkp23SG9Bkw9YzYy37kQEAPhuKMZ` (READY). Completed scoring fixture results survived this redeployment with the same full averages and leaderboard.

Phone-first enhancement: the live host + two-mobile-guest rehearsal completed all eight reveals and final rankings with zero requests to the optional display. Automatic results transition, past-round browsing, Follow host, future-answer secrecy, refresh and reconnect recovery passed against live PostgreSQL. See the verification report for the demo event identifier and physical-device limitations.

UX update deployed 2026-10-01: `dpl_Fjxdcx282QMubFRikujpzjH1Yp9o` (READY), production alias https://tasting.haroldvazquez.com. Remote TypeScript/Vite build passed. GET-only live verification confirmed updated assets, mobile host/login and optional-drawing guest join screens, no browser page errors, and an unchanged public projection of the existing event `1b5cf4476e8cecda99f25a51f8d497e7` (setup, revision 16). No event mutations, database changes, secret changes or DNS changes were performed. Error-level deployment log query returned no records; this is a short smoke check, not sustained monitoring. Physical-phone limitations from the audit remain.
