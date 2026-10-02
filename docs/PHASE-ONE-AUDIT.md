# Phase One: Spoiler Security and Tonight’s Reliability

Date: October 2, 2026  
Scope: the user’s phase-one request, using APP-PURPOSE-AND-BEHAVIOR.md as the behavioral specification. Existing working flows were preserved; no Event Display redesign or new reveal animations were introduced.

## Architecture inspected

- `src/main.tsx`: invitation, joining/recovery, guest autosaving/review/submission, host login/event controls, private guest viewer, display and results.
- `src/avatar.tsx`, `src/photo-picker.tsx`, `src/seating.tsx`, `src/host-tools.tsx`, `src/evening-tools.tsx`: avatars, seating/readiness, recovery/corrections/timers, countdown, insights and recap.
- `src/api.ts`, `src/storage.ts`: browser identity, requests, drafts, storage availability, and API failures.
- `server/app.ts`, `server/identity.ts`: host cookies, origin checks, guest ownership, PIN recovery, round/save/submission/reveal controls and exports.
- `server/results.ts`, `server/wines.ts`: response projections, server-only producers, reveal gating, scoring/averages/ranking and CSV.
- `server/store.ts`, `api/index.ts`, `server/index.ts`, `vite.config.ts`, `vercel.json`: persisted JSON events, atomic SQLite/Postgres mutations, server/static routing and browser build.

## Spoiler audit findings and fixes

No confirmed unrevealed bottle leak was found in the normal setup → tasting → locked → progressive-reveal flow. The server already excludes answer keys, producers/photos and correctness/ratings for unrevealed rounds. The producer map is server-only. This phase strengthens that boundary and verifies it with adversarial tests.

| Boundary | Finding / action | Evidence |
|---|---|---|
| Public/guest/display APIs and polling | Existing reveal projection is retained. Unauthorized host/export/assisted requests are denied; query parameters cannot elevate privileges. | Tests cover setup, tasting, lock, active countdown, every reveal and summary, including guest tokens and projector mode. |
| Owner serialized state | The prior owner response used a broad participant spread. Unexpected future or legacy fields could accidentally become guest-visible. Replaced it and nested entry serialization with explicit allowlists, and restricted entries to unlocked rounds. | Injected answer-key/producer/purchase metadata stays stored but is absent from owner responses. Guest credentials remain excluded. |
| Summary gating | Added a defensive requirement for eight confirmed reveals and no active countdown before summary rankings are serialized. | A deliberately inconsistent summary fixture with one reveal receives no summary/leaderboard. Normal completed events retain their results. |
| Initial HTML / JS / configuration | SPA HTML contains static asset references, not event answers. No producer map is bundled into browser JavaScript. | Browser test checks initial HTML and every built JS chunk for private producer data; static import graph inspected. |
| Hidden DOM / preload / network | Guest tasting DOM contains inputs and their own answers, not host configuration. No bottle-image preload is used. | Browser tests inspect hidden HTML/image preloads and public polling payloads; bottle upload/countdown tests confirm photo withholding. |
| Local/session storage / caching | Storage contains identity, local drafts and display preferences, rather than host keys or bottle information. API responses use no-store. No service worker caches event data. | Source review, browser storage snapshots, and API header tests. |
| Assisted entry | A new separate page uses only a deliberately restricted API. It never fetches full host event/list/setup responses. | Network capture, response allowlist, and DOM checks across a complete assisted event. Key, producer/photo, results, correctness, rankings, and notes are absent, even after reveal. |
| Legitimate host access | Private setup, live read-only scorecards, correction history and host CSV remain authorized and available. | Host-positive API tests and existing full-event browser regression. |

Public wine-type labels remain necessary answer choices. They do not identify which type is in a particular round. Hosts must keep exact bottle/producer names out of public wine-type labels and event names; the setup editor now explicitly explains this. Guests’ own guesses/notes are user content rather than secret server answers. Existing pre-reveal guess distributions on the display report guesses, not correctness. Logical deduction from already revealed wines cannot be prevented without changing the game.

Purchase URLs are not implemented in this build. Unexpected stored purchase metadata is not exposed by the allowlisted guest/assisted projections.

## Changes delivered

1. **Optional avatars:** joining with just name/PIN succeeds; an initials avatar is derived from the name. Drawing/photo controls are optional and collapsed during joining. Existing drawing/photo/emoji avatars and recovery remain compatible.
2. **Guest portrait usability:** round navigation uses a four-column grid on phones; rating controls reflow; important input/navigation/rating/submission targets are at least 44px in tested views; save status remains prominent. No horizontal overflow at 320, 375, 390 or 412px, including 200% text tests.
3. **Personal post-lock view:** recognized guests see an eight-round, read-only Final Scorecard containing saved guesses, ratings, status and expandable private notes. Each actual answer/correctness appears only when that round is revealed. No phone slideshow, countdown, producer/photo, group average or leaderboard competes with the display before summary. Final personal insights remain visible; shared final rankings/recap are expandable.
4. **Host-assisted entry:** roster Assist links open a separate restricted page. The host selects a registered guest, edits unlocked guesses/ratings, explicitly saves, reviews, and submits a valid eight-round card. Both save paths share validation, preserve notes, enforce answer revisions and normal locks, and clear invalidated submissions. Host saves carry optional `enteredBy: "host"` metadata. Assisted submission checks this guest’s eight entry revisions rather than unrelated event changes.
5. **Compatibility:** existing JSON records need no migration. Optional source metadata does not alter scoring or CSV columns. Original tokens/PINs, seating, event wines/key, notes, timers, reveal sequence, correction/reset behavior and host authentication remain intact.

Assisted save failures retain answers in the open editor and offer retry. They are not saved locally across reloads. Switching guests asks before discarding pending assisted answers. Pending/failed changes block assisted final submission.

## Tests run

| Check | Result |
|---|---|
| `npm test` | 34 server/unit tests passed, including 8 new phase-one tests/subtests. |
| `npm run build` | TypeScript and Vite production build passed. |
| `tests/phase-one-browser.ts` | Complete guest + assisted eight-round event passed: initials, PIN recovery, refresh, portrait sizes, enlarged text, targets, save failures/retries, concurrent edits, submissions, normal lock, private notes, progressive answers, unchanged display/countdown, final insights/recap, HTML/DOM/network/storage/bundle checks. |
| `tests/browser.ts` | Existing full host/two-guests/display regression passed, including autosaving, offline drafts, cross-tab revisions, duplicates, earlier edits, submission invalidation, override, all reveals, scoring/CSV/revisit and enlarged text. |
| `tests/phone-results.ts` | Existing full phone-only event passed with independent 390/412px guests and zero display requests; updated assertions for the personal post-lock view. |
| `tests/enhancements-browser.ts` | Practice, autosave/retry, readiness, duplicate warnings, review, pending-save guard and lock transition passed. |
| `tests/required-avatar.ts` | Legacy-named drawing test now verifies optional join, empty/cleared avatar allowance, touch/keyboard drawing, refresh/recovery, enlarged-text layout and accessibility; passed. |
| `tests/photo-avatar-browser.ts` | Upload validation, preview/replacement, refresh, recovery, existing photo persistence, personal-card/final leaderboard photo, privacy and accessibility passed. |
| `tests/evening-browser.ts` | Existing display countdown/photo reveal, personal insights, PNG download/default privacy/optional leaderboard and notes exclusion passed. |
| `tests/seating-browser.ts` | Assignments, safe readiness, refresh, removal, reset/lock/reveal compatibility and three existing shapes passed. |
| `tests/host-tools-browser.ts` | Correction/history, assisted PIN recovery, persistent timer including real expiry, 20-person existing display layouts and corrected reveal/lock compatibility passed. |

Automated axe checks in the tested guest, assisted, avatar and display/host flows reported zero WCAG A/AA violations. Browser rehearsals reported zero page errors. Screenshots were visually reviewed. All write tests used fictional events in isolated local SQLite; no real production event was edited for testing.

Persistence tests reopen SQLite and compare both the changed fixture and an untouched legacy event. They confirm answers, private notes, identity/recovery, optional metadata and legacy data survive. Production verification, when recorded below, is read-only.

## Intentionally unchanged

- The Event Display/table design and reveal animations, including the existing optional countdown.
- Wine choices/order semantics, round sequence, scoring, average eligibility, tie handling, and CSV format.
- The normal guest autosave/draft/retry model, earlier-round editing and locking rules.
- The main website, database schema, production credentials, domains and environment settings.
- Existing real events and the preserved fictional eight-friend demo.
- No purchase-link feature, account system, new dependency or new hosted service was added.

## Remaining risks tonight

- Actual iPhone Safari/Android/TV hardware, camera/file pickers and in-app browser downloads remain untested. Portrait Chromium and accessibility automation are useful evidence, not physical-device certification.
- Weak connectivity can delay confirmed saves/reveals. Wait for Saved and resolve submission warnings before locking; round Ready is not final submission.
- Assisted drafts are not durable across reloads. Save each changed round before switching/closing the page; retry failures in the same open editor.
- Public configuration labels must avoid exact bottle names; the app cannot undo spoilers spoken aloud or entered into a public label.
- The real pouring order must match the private key. Corrections close after the first reveal begins.
- Existing open browser tabs retain their loaded frontend until refreshed. Wait for Saved, then refresh before tonight’s event to receive this phase’s UI.
- No full-room concurrent production load test or authenticated production feature rehearsal was performed. Production release checks are read-only to preserve real tastings.

## Files changed

- `INTENDED_EXPERIENCE.md`
- `README.md`
- `docs/APP-PURPOSE-AND-BEHAVIOR.md`
- `docs/PHASE-ONE-AUDIT.md`
- `docs/VERIFICATION.md`
- `server/app.ts`
- `server/results.ts`
- `src/assisted-entry.tsx`
- `src/avatar.tsx`
- `src/final-scorecard.tsx`
- `src/main.tsx`
- `src/shared.ts`
- `src/style.css`
- `tests/browser-helpers.ts`
- `tests/browser.ts`
- `tests/custom-wines-browser.ts`
- `tests/enhancements-browser.ts`
- `tests/evening-browser.ts`
- `tests/host-sheets-browser.ts`
- `tests/host-tools-browser.ts`
- `tests/phase-one-browser.ts`
- `tests/phase-one.test.ts`
- `tests/phone-results.ts`
- `tests/photo-avatar-browser.ts`
- `tests/recovery-browser.ts`
- `tests/removal-browser.ts`
- `tests/required-avatar.ts`
- `tests/seating-browser.ts`
- `tests/server.test.ts`
- `tests/ux-audit.ts`
- `tests/ux-edge.ts`

