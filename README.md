# The Blind Tasting

A working, mobile-friendly private tasting app: eight wine types, shared scorecards, host-controlled rounds and synchronized phone results, with an optional big-screen display. No AI, accounts or voice service. Guests can use initials or optionally draw/upload an avatar. React + TypeScript + Vite, Express API, PostgreSQL in production, SQLite for local rehearsal. All assets and fonts are served locally.

## What was inspected

The supplied workspace contained no existing application source, repository checkout or hosting configuration. The connected Vercel account lists `haroldvazquez` in the `vazquezharos-projects` team. The live `https://haroldvazquez.com` responds with Vercel headers and serves the existing “Practical AI Workflow Coaching” website. The connector's project-details call failed because its published parameter schema differs from the service schema; deeper project settings and the source repository were unavailable. No existing website, deployment, DNS record or account setting was modified.

**Live app: https://tasting.haroldvazquez.com** · **Host: https://tasting.haroldvazquez.com/host**. The isolated Vercel project is `blind-tasting`, with dedicated `blind-tasting-db` Neon PostgreSQL on the free plan. Server secrets and the custom domain are configured. Hosted guest/host/projector flows, PostgreSQL persistence, concurrent saves, scoring, CSV export and final-domain QR were verified. The existing website remains unchanged. See [hosting status](docs/HOSTING-STATUS.md) for project identifiers and redeployment details. Your host password is supplied separately in the private workspace file `/workspace/tasting-host-password.txt`; it is never uploaded or bundled with source.

## Run locally

Requires Node.js 24 and npm.

```sh
npm ci
node scripts/local-setup.mjs
node --env-file=.env --import tsx server/index.ts
```

Open `http://localhost:3000/host`. Read `HOST_PASSWORD` in your local `.env` to sign in. Create an event, privately assign all eight wine types to the actual pouring order, save the key and share the guest link. No TV or projector is required; the host’s “Open big-screen display” link opens an optional presentation window. The setup script preserves any existing `.env`; `.env.example` documents every setting. No answer order is preassigned in a new event.

Without server secrets, the UI shows a configuration error. Production also requires `DATABASE_URL` and will never silently use local SQLite.

### Local production-build rehearsal

```sh
npm run build
SERVE_BUILD=1 node --env-file=.env --import tsx server/index.ts
```

This serves the real built frontend with the local SQLite backend; it is **local rehearsal**, not hosted production. All browser sessions connect to that backend. `data/rehearsal.sqlite` survives server restarts but is not portable hosted storage. Never deploy that file as the production database.

Optional, clearly labeled 12-person demo results:

```sh
node --env-file=.env --import tsx scripts/demo.ts
```

The script prints event routes. Demo events are named `DEMO · Friday wine club`; it never seeds a hosted database. Create a fresh event for the real evening. The example/demo pouring order is unrelated to your actual order.

## Existing hosting and reproducible Vercel setup

1. Put this directory in its own Git repository and import it as a **new** Vercel project, e.g. `blind-tasting`. Do not link or deploy it into the existing `haroldvazquez` project. If using a monorepo, set the new project's root to this directory.
2. Select Node.js 24, Vite framework preset, build command `npm run build`, output `dist`. The included `vercel.json` routes `/api/*` to `api/index.ts` and serves the SPA for guest, host and projector links. Keep `BASE_PATH` unset for the subdomain deployment.
3. Attach a Neon PostgreSQL database through Vercel Marketplace to **this new project only**, or supply another persistent PostgreSQL service. Set `DATABASE_URL` to its TLS-enabled pooled connection URL. The backend creates the `tasting_events` table on first use; the database role needs CREATE, SELECT, INSERT and UPDATE permission. Use a separate database or schema from other projects.
4. Set server-side `HOST_PASSWORD` to a nonempty private password and `SESSION_SECRET` to at least 32 random characters. Generate a secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Set `PUBLIC_URL=https://tasting.haroldvazquez.com`. Never prefix these variables with `VITE_`, and never commit them. Use the same session secret across redeployments.
5. Deploy the new project. Check `/api/health` returns `{ "ok": true, "storage": "postgresql" }`; sign in and perform the rehearsal checklist. Keep preview and production databases separate. For preview URLs, unset `PUBLIC_URL` so links use the current origin, or configure the exact preview origin.
6. In the **new** project's Domains settings, add `tasting.haroldvazquez.com`. At the domain's DNS provider, add only the `tasting` record Vercel specifies. Use the current project-specific target shown in Vercel rather than assuming a universal CNAME. Preserve the apex and `www` records. Wait for DNS verification and HTTPS, then confirm the existing main website still opens.
7. Guests need to reach the app without Vercel account login. Configure deployment protection appropriately on this project. The event URLs contain random 128-bit IDs; anyone given the link can join/read opened results. The host screen has its own server-validated password. Treat invitations as private.

The hosting steps above are complete for the current deployment. No DNS or credential setup remains for normal use. Create a fresh event in the host screen and complete the physical-phone rehearsal checklist before the evening. The connected source directory is linked to the new `blind-tasting` project only; future CLI deployments must preserve that project link and its database/environment variables.

### If you prefer `haroldvazquez.com/tasting`

A subdomain is safer with the current source unavailable. A subpath requires a deliberate change to the existing website's routing configuration. Deploy this app separately first, then add `/tasting` and `/tasting/:path*` rewrites to the new app in the **existing site's source**, preserving all existing routes. The supported Node proxy setup **preserves the prefix**, with `BASE_PATH=/tasting` at build and runtime and `PUBLIC_URL=https://haroldvazquez.com/tasting`. Guest tokens and host cookies then stay scoped to the app. Vercel's supplied configuration targets the standalone subdomain; prefix proxy rewrites need separate verification. Do not replace the current site's deployment with this app.

### Other Node hosting

Run `npm ci`, `npm run build`, then `NODE_ENV=production node --env-file=.env --import tsx server/index.ts`. Supply persistent PostgreSQL, server secrets, `PUBLIC_URL` and `PORT`. Put HTTPS in front of the app. Docker is optional; a Dockerfile is included. No writable application filesystem is required in hosted production.

## Behavior and scoring rules

- Choices are **wine types**. Rosso di Montepulciano and Chianti Classico remain separate options. Producers live only in the server module and appear after their own round's reveal. The list of choices is never interpreted as a pouring order.
- Guests receive a random browser token stored locally; only its hash is stored in the database. A repeat join with the same token recovers the seat. Names are unique ignoring case; duplicate names ask for an initial/nickname. The same guest in a different browser/device has a different token; use the original browser to recover. Clearing browser storage loses recovery. This deliberately avoids guest accounts.
- Rounds unlock strictly one at a time. Guests may edit every unlocked round while tasting is open. A blank guess/rating and duplicate guesses save as drafts. A rating, if supplied, must be 1.0–10.0 in 0.1 increments. Notes support ordinary keyboard dictation.
- Final submission requires eight guesses, eight valid ratings and exactly one of each wine type. A submitted card stays editable. A valid edit retains its submitted status; an invalid edit clears it and requires another final submission after correction.
- Autosave waits 550 ms after input. “Saved” appears only after a successful backend response. Failed saves retain a browser draft, show an error and offer Retry; reconnect also retries. Draft recovery survives refresh. Conflicting changes from a second tab are rejected by per-round revisions; an explicit button discards the local draft and loads the current saved version. Never infer a successful save from a timeout.
- Host sessions last 12 hours with HttpOnly, SameSite=Strict cookies, HMAC validation and secure cookies in production. Mutations check the request origin. Login and join routes have basic rate limiting; the in-memory limiter is per server instance on Vercel. Use a long host password for a private event.
- Shared event mutations are atomic: PostgreSQL row locks or SQLite transactions. Host-control revisions prevent simultaneous hosts from advancing twice; independent guest saves do not block ordinary host controls.
- Ordinary key edits are prohibited after starting. A separate confirmed pouring-order correction is available before the first reveal; it preserves scorecards and records private history. Before any reveal, an explicit reset requires typing the event name and clears the key/scorecards while keeping seats. Reset drafts are isolated by a new generation number. Revealed events cannot reset; create a new event to preserve results.
- Lock requires all rounds open and valid submitted cards, or an explicit host override after affected guests are named. Lock is enforced on the server. The first round's guess distribution opens upon lock; the host reveals its identity, then opens the next round's guesses, then reveals, and repeats eight times. Only the host can advance. Display polling never receives unrevealed identities/correctness, guesses/ratings during tasting, or notes. After lock, its restricted final-answer parade shows guesses and ratings before the bottle reveal. The host controls each reveal and explicitly opens final summary.
- Each correct valid, unique round guess earns one point, including valid guesses on an incomplete locked card. Duplicate-conflicting rounds and missing/unknown guesses earn no points. Incomplete or unsubmitted cards are visibly marked. This allows useful partial scores when the host overrides the lock.
- Averages count ratings from **valid finally submitted cards only**. Missing ratings never count as zero. Individual draft ratings are shown with an asterisk after reveal and excluded from averages. Cards locked without final submission contribute no ratings, even if otherwise valid. CSV retains every recorded rating and the submitted/complete flags for audit.
- Average calculations sum integer tenths and use the full average for ranking. Display rounds to one decimal. Equal scores share competition ranks (`1, 1, 3`); extreme-score and extreme-rating ties list every matching name/wine. Wines without eligible ratings appear last with “—” and zero ratings; they cannot win a highest/lowest rating award.
- Polling every 1.8 seconds (5 seconds in a background tab) keeps host, guests and the optional display synchronized. Locking opens the first round’s guess breakdown on host/display and replaces guest inputs with a personal, read-only Final Scorecard. Saved guesses/ratings/notes remain visible, with answers/correctness added only after their reveals. The host/display retain the existing presentation. After final summary, guests see private insights and can expand shared rankings/recap. Opening or closing the big-screen display does not change event state. Results stay in the database and event links are revisitable. Notes remain private to their guest and host CSV export. CSV quotes every cell and prefixes formula-like user values to reduce spreadsheet formula injection.

## Verification

```sh
npm test
npm run build
# With the local app running on port 3000:
CHROMIUM_PATH=/path/to/chromium npm run test:browser
# Dedicated host + two mobile guests, never opening a display:
CHROMIUM_PATH=/path/to/chromium npm run test:phones
```

Browser tests use `TEST_PASSWORD`, then `HOST_PASSWORD`, then the local rehearsal default `local-rehearsal-only`; set `TEST_URL` to change the origin. These tests create isolated, clearly named `Demo · browser rehearsal` events in the configured backend. Hosted test events are retained as clearly labeled demo results; create a new event for your real tasting. Chromium is required; use your system browser or `npx playwright install chromium` and set its executable path. Screenshots and a downloaded CSV go to ignored `test-artifacts/`.

The automated suite checks host authentication, duplicate names and repeat joins, refresh recovery, key validation/secrecy, sequential access, draft and decimal saves, earlier edits, revision conflicts, final validation/status invalidation, override warnings, server locking, one-at-a-time reveals, unrounded averages, incomplete scorecards, ties, CSV escaping and actual SQLite restart persistence. The phone-only browser suite checks automatic personal-scorecard transition, response secrecy before reveal, synchronized personal answers, blocked future results, disconnection/refresh recovery and final rankings with no display requests. Other browser checks use separate host, two guest and projector contexts, simulate phone-sized Chromium screens and reconnects, and inspect mobile overflow. See [verification report](docs/VERIFICATION.md) and [rehearsal checklist](docs/REHEARSAL.md).

**Physical iPhone Safari and Android testing was not performed.** Chromium phone viewport checks are not physical-phone certification. Hosted PostgreSQL, Vercel routing, cross-session synchronization and redeployment persistence were tested. The QR SVG matches the exact final-domain invitation URL; physical camera scanning remains to be rehearsed. In this managed environment, hosted Chromium test traffic used Playwright’s Node HTTPS request client with the existing trusted proxy CA, while leaving browser certificate trust unchanged. Native browser testing on real phones remains separate.

## Files and operations

- `src/`: phone, host and projector UI, drawing avatars, public wine choices and validation.
- `server/app.ts`: permissions, API and host transitions; `server/results.ts`: safe projections, scores and CSV; `server/wines.ts`: server-only producers.
- `server/store.ts`: PostgreSQL/SQLite persistence; `api/index.ts`: Vercel function entry.
- `.env.example`, `vercel.json`, `Dockerfile`: environment and deployment.
- `scripts/`: local secret setup and optional labeled demo seed.
- `tests/`: automated backend and browser coverage.

Back up the PostgreSQL database before the event and retain it afterward. Download the CSV after locking; it includes unrevealed identities for the host, so keep it off the projector. Reuse the same database URL on redeploy. Rotating `SESSION_SECRET` signs hosts out but does not delete events. Guest tokens and draft notes are local to each browser; authoritative saved results are on the server.

## Drawing avatars

New guests may optionally choose an avatar: draw an icon with a finger, mouse, or keyboard in the enlarged drawing area, or use **Upload a photo**. Photo upload previews a square crop; supported browsers resize to JPEG, then the server validates and re-encodes the image, removes metadata, and stores a compact avatar with the event. Original photos are not uploaded or stored. JPEG, PNG and WebP work; HEIC/HEIF depend on browser decoding and show a format-help error if unsupported. Choose an ink color, undo a stroke or clear and redraw; joining without either uses an initials avatar. Keyboard arrows position the pen and Space adds points. Recovering an existing seat reuses its saved avatar without redrawing. Existing guests can open **Draw or edit your icon** to draw or upload a replacement, on their scorecard and press **Save icon**; wait for the editor to close after backend confirmation. Drawings persist with the event and appear beside names on scorecards, host rosters, reveals and the leaderboard. Edits lock with submissions. Existing emoji avatars are preserved until a guest saves a drawing.

Avatars are bounded vector strokes, validated server-side (approved colors, integer coordinates, maximum 60 strokes / 1,000 points). Uploaded avatar photos are validated/re-encoded; executable SVG/HTML strings are not accepted. No database migration or new service is required.

## Guest recovery and QR readers

A standard HTTPS QR code cannot force a scanner to use an external/default browser. Prefer the iPhone’s built-in Camera and use the scanner’s Open in Browser/Safari command when available. Bookmark the event URL in the preferred browser.

New guests choose a private 4–6 digit recovery PIN when joining. If a QR reader loses its page, open the same event link in Safari or another browser, choose **Recover my seat**, and enter the original display name and PIN. Recovery restores the same participant, saved guesses/ratings/notes and drawing; it does not add another seat. Names are unique within each event, so a separate recovery ID is unnecessary. Browser refresh still restores identity automatically.

Existing guests must set a PIN in their original browser using **Set a PIN so you can recover your seat** before leaving it. Guests can update their PIN from **Session recovery & event link**, even after locking; this does not unlock scorecards. Forgotten PINs cannot be displayed or recovered, and existing seats without a PIN cannot be recovered from a new browser. Unsaved drafts belong to their original browser; recovery restores backend-confirmed entries.

PINs are stored as salted scrypt hashes, never returned in event/host/display responses or CSV. Recovery retains the original browser and up to five additional browser tokens, enforces ownership and existing scorecard revisions/locks, and uses a persistent 15-minute lockout after 10 failed attempts for a seat, plus request throttling. Existing API-created rehearsal seats without PINs remain compatible. Run `npm run test:recovery` against a running app to verify the browser flow.

## Removing guests

The host can click **Remove** beside a participant at any stage and confirm the named guest. This permanently deletes their seat, scorecard, drawing and PIN. Counts, guess distributions, averages, leaderboard and CSV are recomputed from the remaining participants. Event stage, answer key and other scorecards stay intact. The server requires host authentication, the latest control revision and name confirmation. All of the deleted guest’s browser tokens and recovery access are revoked.

Removal is not a ban: while joining is open, that person can deliberately join again as a new guest. New seats use participant-scoped draft storage so an old deleted scorecard cannot return from local drafts. Existing guests’ older draft storage is migrated without discarding their unsaved work. Run `npm run test:removal` against a running app for the confirmation/synchronization/rejoin checks.

## Local UX audit

Focused improvements and before/after evidence: [audit report](docs/ux-audit/REPORT.md). Current experience: [INTENDED_EXPERIENCE.md](INTENDED_EXPERIENCE.md). This review was local only; it did not deploy or modify production events.

Required-avatar verification: `TEST_URL=http://127.0.0.1:3012 node --env-file=.env --import tsx tests/required-avatar.ts` against an isolated local server. Checks required/cleared drawings, touch and keyboard drawing, larger targets, refresh/recovery, accessibility scan and 200% narrow-screen reflow.

## Custom event wines

During event setup, open **Edit event wines**, replace any of the eight wine types and enter its producer, then **Save wine list**. Each event keeps eight distinct choices and eight rounds. Assign the pouring order afterward. Producers are host-only until their round is revealed. Changing types may clear an incompatible answer key; choices freeze once tasting starts. Existing events retain their original wines. Changes are specific to that event, rather than a global wine library.

Photo-avatar verification: `TEST_URL=http://127.0.0.1:3014 node --env-file=.env --import tsx tests/photo-avatar-browser.ts` against an isolated local server checks file validation, preview, replacement, persistence, recovery, and roster/reveal/leaderboard display. Physical phone photo-library/HEIC testing remains outstanding.

## Live host scorecards

Click a guest in **At the table** to open their read-only scorecard. Confirmed guesses, ratings, private notes, submission/validation status and current correctness update with the existing polling. Unsaved device drafts cannot be seen by the host. Close or Escape returns to the guest list. Host authentication is required; guests and the display never receive other guests’ sheets or notes. Works during tasting and after results.

### Table seating and round readiness

In the host's **At the table** panel, open **Arrange table**, choose round, square, or rectangular, select 2–20 seats, and assign each guest once. Click **Save seating**. Reducing occupied seats asks for confirmation; removing a guest leaves their seat empty. Saved seating survives restarts and the existing reset retains the seating arrangement.

**Open big-screen display** shows the saved layout during setup/tasting, including avatars, names and current-round **Ready / Waiting** status. Ready means an allowed wine-type guess and valid rating have been confirmed saved; notes and final scorecard submission are not required for that round. Guests remain editable until the normal event lock, and clearing an answer returns them to Waiting. Unassigned guests remain visible below the table. No guesses, ratings, correctness, notes, or producers are included in the readiness data. Locking switches to the usual host-controlled results. A display remains optional.

The display offers Automatic, Table map and Compact seats layouts. Automatic switches crowded tables or smaller screens to numbered cards; explicit Table map can still require scrolling. Browser checks do not substitute for a rehearsal on the actual TV and phones.

## Host readiness, practice and scorecard review

During tasting, the host sees the saved current-round ready count and names of waiting guests beside the round controls. This uses the same safe readiness projection as the display. It does not require a display and does not lock individual answers. Clearing an answer returns the guest to Waiting; unlocking a new round checks that round. Connection failures label readiness as the last received state.

Joined guests can open **Try a practice round** while the event is in setup. It uses the real wine-choice, 1–10 rating, decimal adjustment, notes, confirmed autosave and retry controls. Practice is optional; no wine needs to be poured. Practice answers are saved separately, restored on refresh/name-and-PIN recovery, and visible only to their guest. Starting round 1 ends practice automatically. Practice never contributes to readiness, final validation, scoring, averages, rankings or CSV. The existing explicit reset also clears saved practice. Old events need no migration.

During tasting, **Review scorecard** shows all eight guesses and ratings, missing/invalid answers, repeated choices, unopened rounds and changes not yet confirmed saved. **Edit round** returns to an unlocked round. Final submission is inside this review and remains disabled until eight valid, unique choices and eight valid ratings are confirmed saved. Submitted cards remain editable until the normal host lock.

Local feature verification:

```sh
npm test
npm run build
# Against an isolated local server on port 3017 with the local rehearsal password:
node --import tsx tests/enhancements-browser.ts
```

The browser suite rejects hosted origins. It creates a fictional local event and checks practice saving/retry/refresh/privacy, live readiness and clearing, new-round waiting status, eight-round review, duplicate corrections, pending-save submission blocking, mobile overflow, accessibility, final submission and lock transition.

## Pouring-order corrections, assisted recovery and timers

**Correct pouring order** is a separate host-only tool available during tasting or after locking, until the first reveal. Assign all eight wine types once, review the changed rounds, enter a reason and type the event name. It preserves guesses, ratings, notes, seating, submission state and round progress. Scoring/reveals use the corrected order. The private timestamped before/after history persists, including across explicit resets (labelled by tasting version). Guests and display responses never receive the key, history or correction reason. Wine choices/producers remain frozen after starting; the existing reset still clears scorecards/key.

Open a guest’s host scorecard, then **Help [name] recover their seat**. Confirm identity in person, type the exact guest name and enter their chosen new 4–6 digit PIN. **Reset guest PIN** replaces the salted hash and clears recovery lockout. It preserves saved answers, avatar, seating, submission/lock state and currently authorized browser sessions. The old PIN stops working. The PIN is never returned by the API, placed in history or exported. This can also help older seats without a PIN, and remains available after locking.

The optional **Round timer** supports 30 seconds through 60 minutes, start/restart, pause/resume and stop. Saved deadlines and paused remaining time synchronize on host, guest phones and the display through existing polling. Server timestamps help align countdowns across device clocks. Expiry only shows Time’s up; editing, submission, unlocking and locking still require their usual actions. Opening the next round, locking or explicit reset clears the timer. Refresh/restart retains the current timer.

Display layout preference is saved on the display’s browser, independent of event seating. Compact cards keep seat order/numbers, avatars, full names, empty seats and safe Ready/Waiting status. Unassigned guests remain visible. Very narrow screens or large text settings may still need vertical scrolling; use the actual equipment for rehearsal.

Local verification for these tools:

```sh
npm test
npm run build
# Isolated local server on port 3018, HOST_PASSWORD=local-rehearsal-only:
node --import tsx tests/host-tools-browser.ts
```

## Reveals, private taste insights and evening recap

During setup, **Add bottle photos (optional)** attaches a JPEG/PNG/WebP photo to each wine type. Photos preserve their aspect ratio, are resized in the browser, validated and re-encoded on the server without metadata, and persist with the event. They freeze when tasting starts. Guests/display browsers receive a photo only after that wine’s reveal.

Before each reveal, the host can enable **Three-second reveal countdown**. Its saved server deadline synchronizes phones and the display and survives refresh. The server withholds wine identity, producer, photo, correctness and ratings until the deadline. Next-round and summary controls remain blocked during the countdown. Existing immediate reveals are unchanged. Reduced-motion preferences remove the countdown animation; slow connections may show a waiting message until the confirmed reveal arrives.

At final rankings, a registered guest sees **Your taste, by the glass**: all tied personal favorites, saved rating range and each rating’s comparison with the eligible group average. Draft ratings are identified as excluded from group averages. This private panel is absent from public/display views and the recap.

**Take the evening home** creates a preview and downloads a PNG containing the event title, all eight wines/producers/group ratings and all tied group favorites. Guest names are excluded by default; the optional leaderboard includes names, shared ranks and incomplete-card labels. Private notes and personal insights are always excluded. Images are rendered locally without an external service. Actual image downloading/sharing in iPhone Safari, Android and in-app browsers still needs device rehearsal.

Local feature browser rehearsal: `node --import tsx tests/evening-browser.ts` with the built app on port 3019 (or set `TEST_URL`). It creates isolated fictional events; do not point it at real production tastings.


## Phase one: spoiler protection and host-assisted entry

Current behavior: [APP-PURPOSE-AND-BEHAVIOR.md](docs/APP-PURPOSE-AND-BEHAVIOR.md). Audit and scoped verification: [PHASE-ONE-AUDIT.md](docs/PHASE-ONE-AUDIT.md).

From the roster, **Assist** opens a separate authenticated page that loads no private setup/reveal data. Choose a registered guest, enter an unlocked round’s guess/rating, then **Save round**. Notes are preserved, host saves are labelled, and revision conflicts require loading the latest answer. Review all eight saved rounds and submit the valid scorecard; unsaved/failed changes block submission. The server enforces the same validation, generation and lock rules. Assisted drafts are retained in the open editor, not across reloads.

The guest join page uses initials by default, with drawing/photo controls in **Add an avatar (optional)**. After locking, guests see their saved personal Final Scorecard; private notes are expandable and revealed answers appear progressively. Shared final results and recap remain available after summary.

Local verification: `npm test`, `npm run build`, and `TEST_URL=http://127.0.0.1:3021 node --import tsx tests/phase-one-browser.ts`. Use an isolated SQLite rehearsal server; this browser test creates fictional events.

## Signature end-of-tasting reveal

The display now uses a saved, staged guest guess parade followed by the optional three-second countdown and bottle-centered reveal. Phones keep their personal scorecards with progressively revealed bottle details and exact supplied retailer links. Champion/wine-ranking results appear only after the host opens Final Summary. See [signature reveal, verification and tonight checklist](docs/SIGNATURE-REVEAL.md). Tonight-specific configuration is inactive until the actual event and eight exact bottles are supplied.
