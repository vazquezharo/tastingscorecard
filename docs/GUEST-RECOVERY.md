# Guest session recovery without PINs

This incremental update keeps the existing database, event JSON, participant records and validation. No migration, production reset or new guest account system is required.

## Guest App

Open the normal invitation. A recognized browser automatically restores its existing seat. Otherwise choose **Recover my seat**, select the existing display name and tap **Ask host to approve**. Wait on this page and speak to the host. The name selection sends only a pending request; no participant access or private scorecard data is returned. Requests persist through refresh and expire after 15 minutes. Denial never attaches a token; the guest may ask again after speaking to the host.

## Host Console

The pending-request panel sits beside the current event state, with 48px or larger Approve/Deny buttons. Confirm the request with the guest in person. Approval adds the requesting browser's fresh identity-token hash to the existing participant's valid sessions. It does not rotate or erase existing sessions. Denial closes only that request. Duplicate responses are rejected atomically; expired or removed seats cannot be approved.

For the secondary flow, open the guest's read-only scorecard, tap **Create recovery link**, then copy/share the URL privately. Links expire after 10 minutes. A new link replaces the previous unused link for this seat; authenticated sessions remain valid. The guest must tap **Recover my seat with this link**. GET/navigation/refresh never authenticates or consumes a link. The secret is in a URL fragment, avoiding server request URLs/referrers; only its SHA-256 hash is stored. Redemption attaches the session and consumes the link in one event transaction. Expired, reused, cross-event, missing-seat or conflicting-browser links fail closed.

## Preservation and privacy

Both flows restore the same participant ID, avatar, confirmed answers/ratings/private notes, practice, seating and submission state. Unsaved device-local drafts do not transfer. Existing server locking and round validation remain authoritative. Locked guests recover their personal read-only scorecard and cannot edit. Selecting another guest's name without host approval grants nothing. Recovery data is absent from public, owner, assisted and Event Display projections; the Host Console receives only pending IDs, participant IDs/names and timestamps. Removal revokes sessions and deletes outstanding requests/links for that guest.

PIN UI and authentication/reset endpoints are gone. Legacy stored fields are left inert to preserve existing events; they are never exposed or accepted as credentials. New joins store no PIN fields. No-storage browsers keep their identity for the current tab, but need host recovery after closing/reloading if storage is unavailable.

Recovery attempts are throttled per IP/event/browser (30 per 15 minutes), plus an event/IP cap of 150 per 15 minutes against rotating browser tokens. Pending requests are deduplicated per browser, with a maximum of 100 active requests per event. The host must be signed in and reachable for approval or to create a replacement link.

## Files changed

- `server/app.ts`, `server/identity.ts`, `server/results.ts`: persisted approval/link flows, session ownership, secret hashing, throttling and safe projections; removal cleanup; retire PIN authentication.
- `src/recovery.tsx` (new), `src/main.tsx`, `src/host-tools.tsx`, `src/shared.ts`, `src/api.ts`, `src/style.css`: guest request/redeem UI, touch-first host controls, PIN removal, event types and current-tab identity fallback.
- `tests/recovery.test.ts`, `tests/practice.test.ts`, `tests/phase-one.test.ts`, `tests/host-enhancements.test.ts`: new security/recovery coverage and updated persistence scenarios.
- Browser tests/helper: remove obsolete PIN join steps; use host approval or links for existing cross-browser scenarios; new full recovery rehearsal.
- `README.md`, `docs/APP-PURPOSE-AND-BEHAVIOR.md`, `docs/THREE-SURFACES.md`, `docs/VERIFICATION.md`, this report: current behavior and setup instructions.

## Verification

The final recovery implementation passed all 44 server/unit tests. All 18 existing browser rehearsals passed, including the corrected recovery rehearsal and UX audit (`AUDIT_MODE=after`), plus the three-surface and dynamic-table rehearsals. Recovery checks cover denial/approval, refresh, identity/session preservation, saved notes/ratings/seating, locked recovery, one-use links, safe link opening/refresh, privacy, overflow and accessibility. The Host Console readiness heading uses the correct accessible level in the compact iPad layout.

After moving initial setup below live controls, the production build and TypeScript checks pass. Host Console was rehearsed at 1024×768 and 768×1024; Guest App at phone size; Event Display at 16:9. Production publication is recorded separately after deployment. No live tasting was used as a mutable test event.

Tests use fictional local events and disposable SQLite databases. Physical iPad/phones and real group-chat link previews remain outside automated Chromium verification. No production event writes were performed during testing.

## Host Console ordering

Live actions stay at the top in setup and tasting: Start/open rounds, readiness, guest list, timer and Arrange table. Initial wine list, bottle photos and pouring order now sit in **Event setup & fixes** at the bottom. This section opens automatically during setup; corrective/reset tools remain separate during tasting. Results appear before this bottom section.

The layout changes passed TypeScript, production build and browser verification. The earlier credit-related review failure was resolved; browser checks resumed normally.
