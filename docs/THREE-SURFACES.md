# Guest App, Host Console and Event Display

This phase formalizes three separate surfaces on the existing app. It adds no new reveal animations, final scoreboard design, scoring rule, database migration or client-side state advancement. Existing reveal functionality is retained.

## Routes and responsibilities

| Surface | Route | Use |
|---|---|---|
| Guest App | `https://tasting.haroldvazquez.com/e/<EVENT_ID>` | Guest phone: join/recovery, tasting input, autosave/review/submission, personal read-only results. |
| Host Console | `https://tasting.haroldvazquez.com/host`, then `/host/e/<EVENT_ID>` | Authenticated private host controls, designed for an iPad in landscape or portrait. Never project this page. |
| Event Display | `https://tasting.haroldvazquez.com/display/e/<EVENT_ID>` | Dedicated laptop/TV presentation. Public, read-only and automatically follows confirmed server state. |

Existing `/projector/e/<EVENT_ID>` links remain working aliases of the same Event Display. Legacy `projector` CSS/query identifiers remain for compatibility; component names and user-facing surface labels are formalized. Display requests continue using the existing `view=projector` API projection, which ignores guest tokens and excludes personal scorecards/notes.

## Host Console

A prominent state strip shows the current stage/round, total guests, current-round Ready count and submitted count. Ready means an allowed guess and valid rating confirmed saved, rather than final submission or a per-round lock. The active panel shows Waiting names, the live timer if present and a full-width next logical action. Touch controls are at least 48px, primary actions at least 60px. The tested iPad sizes keep the current-round action visible from the top of the page.

Guest management and timer editing are separate from the primary action; guest lists use bounded scrolling on tablets. Pouring-order correction/history, reset and CSV export are grouped under **Event setup & fixes**, collapsed by default. Existing typed-name/reason confirmations for corrections/resets and the named removal confirmation remain intact.

Locking shows submitted counts and incomplete/unsubmitted names before the action. A separate native confirmation states the event name/counts, that editing ends immediately, affected guests and the pending-save limitation. Cancel makes no request. Pending saves on other devices cannot be detected reliably from existing server state; the console says to ask guests to wait for **Saved**. No presence/heartbeat system or validation change is introduced. The existing deliberate override remains required for incomplete/unsubmitted cards.

## Event Display

Waiting: event name and Blind Wine Tasting identity, group-chat link instruction, registered guest names/avatars/initials, and an optional secondary QR. QR scanning is never required.

Tasting: Round X of 8, event name, optional saved timer, guest names/avatars, Ready/Waiting and current readiness count. It renders no guesses, ratings, correctness, scores, rankings, averages, producers, bottle images, purchase links, notes or tasting hints. The QR panel is omitted during tasting to prioritize the room information.

There are no display buttons, inputs, selectors or administrative controls. Table layout adapts automatically rather than requiring interaction on the TV. Host seating remains configurable and persistent. Opening/reloading/reconnecting/closing the display sends only read requests and cannot start, unlock, lock, reveal or open summary. Errors identify stale received state; timers and stage transitions follow existing server data. Existing locked/reveal/summary functionality is preserved.

## Recommended setup for tonight

1. On the **iPad**, open Host Console, sign in and select the real evening. Use landscape when convenient; portrait is supported. Keep it private.
2. On the **laptop connected to the TV**, click **Open Event Display** from that evening, or open `/display/e/<EVENT_ID>` directly. Fullscreen that window and mirror/extend it to the TV. Do not mirror the iPad or Host Console. Test the physical TV resolution/overscan and browser zoom before guests arrive.
3. Put the Guest App invitation `/e/<EVENT_ID>` in the group chat. QR on Event Display is an alternate joining option. Guests should use a regular browser, ask the host to approve recovery when switching browsers and wait for **Saved**.
4. Use the iPad’s primary action to start/open rounds. Ready counts describe the current round. After round 8, ask everyone to review and submit, inspect the incomplete list, then confirm locking.
5. Run existing reveals from Host Console at the table’s pace; explicitly open Final Summary after wine 8. Event Display and guest phones follow automatically.
6. Plug in both devices, prevent laptop sleep and verify stable Wi-Fi. Test a real phone save/recovery and the TV’s readability before the event.

## Changed files

Application:

- `src/main.tsx` — surface component/UI names, canonical display route/legacy alias, waiting/tasting presentation, iPad state overview, lock confirmation, secondary/admin grouping.
- `src/seating.tsx` — read-only automatic layout mode, optional-QR wording and registered count.
- `src/style.css` — scoped tablet controls/state layout and public display typography/layout.

Tests:

- `tests/surfaces-browser.ts` — new independent Guest App/iPad Host Console/TV display rehearsal.
- `tests/browser.ts`, `tests/phone-results.ts`, `tests/seating-browser.ts`, `tests/host-tools-browser.ts`, `tests/ux-audit.ts` — recognize formal display link and explicit lock/admin flows; verify automatic read-only seating.

Documentation:

- `README.md`, `docs/APP-PURPOSE-AND-BEHAVIOR.md`, `docs/VERIFICATION.md`, `docs/THREE-SURFACES.md`.

No server, scoring, persistence or main-website code changed. Environment secrets, database files and test artifacts are excluded from publishing.

## Verification and limits

The build and all 37 existing unit/server tests passed. New browser rehearsal verifies live API/state boundaries, independent 390px guest phone, 1024×768 and 768×1024 iPad layouts, 1280×720 and 1920×1080 Event Display, 48px/60px controls, visible next action from page top, joins/initials, readiness/timers, all eight rounds, display route aliases, no mutations on open/refresh/close, no controls/spoiler data, lock cancel/confirm and preserved reveals/explicit summary. Automated accessibility scans on guest, host and display have no tested WCAG A/AA violations; no page errors.

Physical iPad/Safari, iPhone/Android and the actual HDMI/TV remain untested. Very long Waiting lists, unusually long event names, large groups or increased browser zoom can require scrolling. Pending saves are inherently unknown to the host; wait for Saved and final submission. Native confirmation appearance depends on the browser. Existing network/polling delays and stale-state error behavior remain. Tonight's bottle configuration is unchanged by this phase.

## Completed regression results

All 18 existing browser scripts passed: `browser`, `phone-results`, `recovery-browser`, `removal-browser`, `custom-wines-browser`, `host-sheets-browser`, `enhancements-browser`, `required-avatar`, `photo-avatar-browser`, `seating-browser`, `host-tools-browser`, `phase-one-browser`, `evening-browser`, `ux-display`, `ux-edge`, `ux-audit`, `signature-browser` and `signature-layout`. The new `surfaces-browser` passed as well. Tests used independent sessions, fake credentials and disposable local SQLite databases. Fresh local servers were used when the existing login limiter was exhausted; production rate limiting was not changed.

The 20-guest seating regression still passes all round/square/rectangular shapes at 1920×1080, 1280×720 and 1024×768, with no seat overlap or overflow. Existing countdown refresh/privacy, PNG recap, personal insights, all-eight reveals and final rankings are retained and tested, rather than redesigned in this phase. Local screenshots under ignored `test-artifacts/surfaces/` were visually inspected. All 37 unit/server tests and the TypeScript/Vite build passed.

## Production check

Published commit `01ef7e00dcfd4a9624f4c27b09f28d981e3ff765` through the confirmed Git integration into Vercel `blind-tasting`. Deployment succeeded: https://vercel.com/vazquezharos-projects/blind-tasting/Ezp51qApju1zoqBhJRUFMs5hHoQE. Live JavaScript/CSS match the verified build. PostgreSQL health passed; canonical `/display/e/...` and legacy `/projector/e/...` both render the preserved completed demo with no display controls, no page errors and no mutations. Reloading both routes leaves the demo exactly unchanged, comparing all public state except serverTime. Tablet Host Console login renders without horizontal overflow. Main website HTTP 200. No real event was used for mutation testing. This final appendix is local after publishing, avoiding another documentation-only redeployment.

## Rectangular table seating

Rectangles put all seats on the two long sides, with no seats at the heads. With eight saved seats, seats 1–4 run left to right above the table and seats 5–8 run right to left below it. The compact Event Display preserves this geometry at normal laptop/TV sizes. Other seat counts split across the two long sides, assigning the extra seat to the top for odd counts. Existing assignments, avatars, readiness and saved event state are unchanged. Select Rectangle and 8 seats in Host Console → Arrange table, assign guests and Save seating to use the eight-seat arrangement.

The approved walnut tabletop is generated artwork (`src/assets/walnut-tabletop.png`). Its desktop width is 25% smaller than the previous full-width table. Larger seat cards closely fill each long side. Each row scales its card, avatar and name sizes with the number of assigned guests on that side. Empty spots collapse on Event Display once guests have assigned seats; the saved seat numbers, underlying seating and physical sides remain unchanged. Unassigned guests remain visible separately. Smaller displays use a wider frame and shallower tabletop to preserve readability.

TypeScript, production build and all 44 server/unit tests pass. The new `tests/dynamic-table-browser.ts` checks 4, 6, 8, 12 and 20 fictional guests at 1920×1080, 1280×720 and 1024×768: no overlap/overflow/head seats, dynamic size changes, safe removal, read-only requests and refresh. Existing host-tools rehearsal checks 20 long names with the timer visible at the same sizes. All 18 existing browser scripts and the three-surface rehearsal pass. Physical TV/phone/iPad testing remains outstanding.
