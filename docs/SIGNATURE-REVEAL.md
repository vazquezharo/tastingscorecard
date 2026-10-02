# Signature reveal: implementation and tonight’s operation

October 2, 2026. Incremental changes based on verified `vazquezharo/tastingscorecard` main commit `3302612`. The presumed later dedicated Host Console/display phases were not present in this source; existing host controls and `/projector/e/:id` were retained.

## What changed

- After normal lock, the display introduces each round and adds every guest’s final saved guess/rating at 0.8-second intervals. Cards stay visible. A server-persisted `revealStage` clock joins the current stage after refresh/reconnect; old stored events without it show cards immediately.
- The host queues one reveal. If clicked early, reveal authorization waits for the saved parade end, followed by the selected optional three-second countdown. The existing server deadline withholds bottle identity/correctness until completion. Only the host opens the next round; there is no automatic advancement.
- Once confirmed, the bottle becomes the centerpiece, with wine/producer, eligible average/count and clear, gentle checkmarks for correct guesses. Missing or failed bottle images use a generic bottle.
- No public overall leaderboard, cumulative score or wine rankings are available until the host explicitly opens Final Summary after all eight confirmed reveals. The final display includes all tied champions, eligible group favorites, full-precision wine ranks with competition ties, and secondary reliable evening stats. Unrated wines have no rank. Incomplete cards retain the existing point rules and labels.
- Identification stats use actual submitted/saved guesses and existing correctness rules, excluding no-guesses and omitting comparisons when response counts differ. Rating stats use eligible submitted ratings, need two ratings for spread, retain ties and omit absent data. Uninformative all-eight identification/spread ties are omitted. Small-screen summaries prioritize champions/rankings when numerous ties would crowd out secondary stats.
- Phones keep the read-only Final Scorecard, adding revealed producer/photo, eligible group average/count and an exact supplied HTTPS retailer link. Original guesses, ratings, private notes and final personal taste insights remain. Links open with `noopener noreferrer`; missing/unsafe links are omitted. No searches or guessed retailer URLs are generated. The PNG recap stays unchanged and excludes notes/links/private insights.

## Spoiler and persistence boundaries

`server/tonight-bottles.ts` is the only new bottle configuration. It is imported exclusively by the server. It applies only to its exact event ID and when all eight bottle types match that event’s entire saved pouring order. A changed order or unrelated event fails closed to existing event data. This is a server response overlay, not a rewrite of stored events. Eight exact names/images/URLs are never placed in client configuration.

Public parade data is deliberately separate from revealed results. It contains only round, display names, avatar/initials, saved guesses and valid ratings, only after lock. It never contains notes, correctness, producers, photos, purchase URLs, counts/averages or cumulative scores. Existing result guesses still omit ratings/correctness before reveal; the separate parade is the newly allowed final-answer presentation.

Optional `revealStage` and countdown `startsAt` fields are added to existing persisted event JSON. No schema migration, scoring change, storage replacement, destructive reset or new service. SQLite close/reopen tests verify clocks; ordinary production Neon JSON persistence is retained. Public/API responses remain `no-store`. The display makes only GET requests, and does not use the host’s credentials or control APIs. Animations use short opacity/translation transitions and respect reduced motion; server timing remains the same.

## Bottle data still required

The pasted request contained eight empty bottle forms. No exact event ID, photos or retailer URLs have been supplied. Configuration is **inactive** (`eventId: ""`, `bottles: []`). Existing event producers/photos work; missing photos use the generic bottle, and purchase buttons stay absent.

Supply the real event link/ID and eight records in physical pour order: wine type, exact bottle/producer, image URL or photo, and exact retailer URL (optional). Configure and verify that event only. Do not substitute the fictional browser fixture. Retailer/photo URLs must use HTTPS and contain no credentials. External photo hosts can fail or block embedding; rehearse actual assets before guests arrive.

## Launch

- **Guest App:** `https://tasting.haroldvazquez.com/e/<EVENT_ID>` from the host’s invitation link or QR. Guests keep their browser and recovery PIN.
- **Host Console:** `https://tasting.haroldvazquez.com/host`; sign in, open the correct evening (direct route `/host/e/<EVENT_ID>`).
- **Event Display:** the host’s **Open big-screen display** link, `https://tasting.haroldvazquez.com/projector/e/<EVENT_ID>`. Open in a separate regular browser window on the laptop connected to the TV; make that window full screen and mirror/extend it to the TV. This page follows saved state and requires no TV interaction.
- Completed fictional demo for a read-only preview: `/projector/e/9681e53e9196cc78b882d0ccc9240e72`. Do not use it for tonight’s tasting.

## Tonight setup checklist

1. Provide/verify tonight’s exact event and eight bottles; compare physical numbered bottles with the saved private pouring order. Configure public wine-type labels separately from private exact names.
2. Test the actual laptop/TV at its intended resolution and zoom. Confirm photos load, names/ratings are readable and there is no overscan. Keep the host controls on the iPad or a different laptop window; show only Event Display on TV.
3. Open one guest phone in a regular browser, join/recover, test saving and PIN recovery. Confirm everyone knows to wait for **Saved**.
4. Taste all eight wines, review each guest’s full card, resolve duplicates/missing ratings, and get final submission. Readiness is not final submission. Avoid override unless intentional.
5. Lock once everyone is ready. Choose countdown, queue **Reveal wine 1**, let the parade/countdown finish, and pause for discussion. Use **Show round N guesses**, then **Reveal wine N** for each remaining wine.
6. After confirmed reveal 8, press **Open final summary**. Guests can review private notes, bottle links and insights, and generate the recap PNG.
7. Keep laptop plugged in, prevent sleep, use stable Wi-Fi, and keep the event link/PIN available. Reconnect/refresh restores saved state; a disconnected screen cannot promise synchronization.

## Verification

See the verification appendix below for exact results and limits. Local tests use disposable `/tmp` SQLite files, fake passwords and fictional events only. No production tasting is created, unlocked, locked or revealed by verification.

## Files changed

Application/server:

- `server/app.ts`, `server/results.ts`, `server/tonight-bottles.ts` (new)
- `src/shared.ts`, `src/main.tsx`, `src/final-scorecard.tsx`, `src/style.css`
- `src/reveal-display.tsx`, `src/reveal-stats.ts` (new)

Tests/docs:

- `tests/signature.test.ts`, `tests/signature-browser.ts`, `tests/signature-layout.ts`, `tests/signature-server.ts` (new local fixture)
- `tests/browser.ts`, `tests/phone-results.ts`, `tests/evening-browser.ts`, `tests/ux-display.ts`, `tests/ux-edge.ts`, `tests/ux-audit.ts` (adapt current intended UI and keep audit output under ignored artifacts)
- `README.md`, `docs/APP-PURPOSE-AND-BEHAVIOR.md`, `docs/VERIFICATION.md`, `docs/SIGNATURE-REVEAL.md`

No main-site files, database schema, secrets, environment/deployment settings, or existing event payloads were changed by implementation.

## Verification results

- Production TypeScript/Vite build passed; all 37 server/unit tests passed (34 existing plus 3 targeted tests).
- All 16 existing browser scripts passed against isolated local databases: `browser`, `phone-results`, `recovery-browser`, `removal-browser`, `custom-wines-browser`, `host-sheets-browser`, `enhancements-browser`, `required-avatar`, `photo-avatar-browser`, `seating-browser`, `host-tools-browser`, `phase-one-browser`, `evening-browser`, `ux-display`, `ux-edge`, `ux-audit`. Assertions were updated where the requested presentation intentionally changed. A fresh rehearsal server resolved test-only login rate limiting; the limiter remains enabled.
- New `signature-browser` passed with 11 fictional guests, two independent 390/412px mobile contexts, 1024px host and independent display. All eight staged reveals used real persisted timing; countdown/parade/revealed refresh, offline stale-state display/reconnect, final-summary gating, ties, safe/missing retailer links, missing/failed photos, private notes, insight continuity and display GET-only operation passed. No display mutations or browser page errors. Final display and phone accessibility scans: no tested WCAG A/AA violations.
- New `signature-layout` passed at 1280×720 and 1920×1080 for 11 long names during reveal and a stress fixture with 11 tied champions plus all eight tied group favorites. No scrolling/overflow in these tested layouts. This test uses an intercepted public-response rendering fixture; it does not rewrite stored events. Server tie/rank behavior is separately tested.
- The existing 23-screen UX audit passed: zero horizontal-overflow screens, zero automated accessibility violations and zero page errors. Existing recap PNG download and note privacy passed in `evening-browser`.
- Local close/reopen persistence, untouched legacy fixture comparison, exact-key/event configuration isolation, unauthorized-control rejection, all-eight deadline secrecy and withheld leaderboard are tested in `signature.test.ts` and existing suites.
- Screenshots under ignored `test-artifacts/signature/` include reveal and final/stress layouts; these were visually inspected. Generated test artifacts, SQLite files and environment secrets are excluded from publishing.

### Remaining practical limits

Actual tonight bottles/retailer URLs are not configured or verified because they were not supplied. Physical TV/HDMI/overscan, Safari/iPhone/Android, actual retailer behavior, a full room of production devices and camera/download behavior remain untested. Very long bottle names, larger groups, smaller screens or high browser zoom may need more space. Numerous ties use a compact summary and secondary stats are omitted on shorter displays. Polling/network delays can shorten what a late/reconnected screen sees of the saved parade; it never restarts or advances the event. One read-only production demo fetch returned a transient HTTP 500 before deployment; immediate follow-up health/demo requests succeeded. No cause is established by this observation.
