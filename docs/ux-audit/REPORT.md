# Wine tasting UX audit — local review

2026-10-01. Focused changes to the existing React app; server game rules, scoring, authentication, persistence and reveal projections remain unchanged. No production event data, DNS or deployment was modified. All fixture events are labeled Demo and stored in an isolated `/tmp` SQLite database.

## Scores and improvement passes

The [rubric](RUBRIC.md) was defined before changes. Scores are heuristic judgments supported by browser interactions and screenshots, not a study with guests or an accessibility certification.

| Category                     |     Before |      Final | Evidence and remaining deduction                                                                                                                                                                                  |
| ---------------------------- | ---------: | ---------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest/host journey clarity   |      19/25 |      25/25 | Optional drawing, viewed/current round distinction, submission guidance, host key guidance and complete two-phone event without display verified.                                                                 |
| Mobile interaction           |      18/25 |      23/25 | 320/390/412px layouts, real 200% font enlargement, decimal/endpoints, touch drawing and repeated-action guard checked. −2: native Safari/Android keyboard and viewport behavior untested.                         |
| Feedback/validation/recovery |      11/20 |      19/20 | Blank/confirmed/delayed/failed saves, retained conflicts, jump buttons, invalidation, storage fallback and expired host login checked. −1: forgotten PIN still cannot be reset after losing the original browser. |
| Results comprehension        |      12/15 |      14/15 | Persistent Follow host, literal guess stage, incomplete/tie/exclusion copy and twelve-person 1080p reveal checked. −1: actual projected distance/room lighting untested.                                          |
| Accessibility/consistency    |      12/15 |      14/15 | Zero axe violations on scanned states; focus/keyboard, labels, non-color signals, reduced motion and narrow enlarged-text reflow checked. −1: physical screen-reader testing absent.                              |
| **Total**                    | **72/100** | **95/100** | No unresolved observed P0; acceptance met in the evaluated browser environment.                                                                                                                                   |

1. **Baseline:** full event walkthrough and 23 screenshots; found the storage participation blocker and scorecard/results friction. See [baseline](BASELINE.md).
2. **Focused fixes and retest:** full walkthrough passed; visual inspection still found squeezed results navigation at 200% text. Acceptance remained open.
3. **Enlarged-text refinement and edge checks:** wrapped sticky results navigation; gave the enlarged numeric rating its own row on phones. Retested walkthrough, blocked storage, delayed/failed saves, lock with private pending edits, host session/reconnect and twelve-person display. Final assessment: 95.

Test-script selector mistakes and an injected storage mock's transpiler helper error were corrected before recording passing results. A local host login rate limit was reached during repeated test setup; final checks used a fresh local process against the same isolated persistent database. No production protections were disabled.

## Prioritized findings and changes

| ID  | Priority | Problem → implemented user benefit                                                                                               | Outcome                                                   |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| F01 | P0       | Storage exception blocked joining → temporary in-memory identity/drafts and explicit recovery warning                            | Fixed; join/save verified with storage methods throwing   |
| F02 | P1       | Empty round claimed Saved → No entry yet; Saved only after backend confirmation                                                  | Fixed; delayed response assertion                         |
| F03 | P1       | Conflict offered only discard → confirm keeping/saving the draft or loading latest saved version                                 | Fixed; retained draft saved against latest revision       |
| F04 | P1       | Earlier scorecard showed latest round heading → viewed/current distinction and return button                                     | Fixed; round 1 while host on 8 verified                   |
| F05 | P1       | Validation lacked direction → duplicate/missing-round jump buttons, submit reasons and immediate draft-status warning            | Fixed; submit/edit/correct/resubmit walkthrough           |
| F06 | P1       | Optional avatar/management displaced entry → collapsible drawing and management below scorecard                                  | Fixed; join/scorecard screenshot comparison               |
| F07 | P1       | Rating endpoints slow; Clear consumed a row → 1–10 presets, compact Clear, decimal controls and ample numeric width              | Fixed; 1.0, 1.1, 8.3, 10.0 and blank tested               |
| F08 | P1       | Disabled host actions/session expiry unclear → key guidance, updating state, stale-data warning and same-event sign-in           | Fixed; expired cookie and offline controls verified       |
| F09 | P1       | Follow host scrolled away; results inclusion unclear → sticky navigation, explicit guesses, no-eligible/excluded-rating/tie copy | Fixed; browsing/scroll and twelve-person display verified |
| F10 | P1       | Lock transition hid failed drafts → private unsaved-draft details on original device                                             | Fixed; not included in results or public responses        |
| F11 | P1       | Pixel fonts defeated enlargement → rem text, responsive toolbar and rating layout                                                | Fixed; font size doubled; 320px root reflow checked       |
| F12 | P2       | Forgotten PIN unclear; repeat creation possible → original-browser PIN guidance and creation guard                               | Copy/guard fixed; no new PIN reset system                 |

Reset and guest removal remain separate from ordinary round controls with explicit destructive confirmations. Removal cancellation and confirmation passed existing browser regression. Notes remain private; no spotlight or recovery authority was added.

## Before/after evidence

| Experience                  | Before                                          | After                                                  |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Joining without drawing     | [Phone](before/join-phone.png)                  | [Phone](after/join-phone.png)                          |
| Blank entry and ratings     | [Scorecard](before/blank-round-phone.png)       | [Scorecard](after/blank-round-phone.png)               |
| Concurrent edit             | [Conflict](before/conflict-phone.png)           | [Conflict](after/conflict-phone.png)                   |
| Earlier round               | [Round heading](before/earlier-round-phone.png) | [Round heading](after/earlier-round-phone.png)         |
| Duplicate correction        | [Validation](before/duplicate-round-phone.png)  | [Validation](after/duplicate-round-phone.png)          |
| Host key guidance           | [Phone host](before/host-setup-phone.png)       | [Phone host](after/host-setup-phone.png)               |
| Following/browsing results  | [Browsing](before/browsing-phone.png)           | [Browsing](after/browsing-phone.png)                   |
| Unavailable browser storage | [Blocked](before/storage-unavailable.png)       | [Participation warning](after/storage-unavailable.png) |

Additional evidence: [200% scorecard](after/scorecard-text-200-percent.png), [200% summary](after/summary-text-200-percent.png), [private drafts after lock](after/locked-private-draft.png), [twelve-person display](after/no-eligible-ratings-display.png). Baseline 200% root-font screenshot did not actually enlarge fixed-pixel text; after screenshots do.

## Verification

- Production build and TypeScript check passed.
- All 12 automated backend tests passed: authentication, idempotent join, answer secrecy, key/access rules, concurrent revision rejection, draft/final validation, server locking, scoring/averages, CSV, restart persistence and reset.
- Existing full host/guest/projector browser walkthrough passed; offline recovery, refresh, eight rounds/reveals, missing card, CSV and saved revisit included.
- Two independent phone guests plus host completed all eight reveals and tied final rankings with **zero display requests**. Future answers/actions remained blocked. Previous-result browsing, Follow host and partial/final refresh passed.
- PIN recovery and guest-removal browser suites passed, including fresh-browser identity, preserved notes, changed PIN, removed token denial and no old-draft resurrection.
- Audit captured 23 representative before/after states. Final scans report zero axe violations and zero root horizontal overflow; offline screen scan omitted while disconnected. Browser page errors: zero.
- Targeted checks passed for blocked storage participation, held-response Saving state, retained private draft after override, expired host recovery, disabled stale host controls, one request for repeated create, actual doubled text and keyboard focus.
- Twelve guests fit a 1920×1080 reveal with no scrolling; no eligible ratings are labeled explicitly, private notes absent, reduced-motion animation disabled.

Machine-readable evidence: [walkthrough](after/report.json), [recovery edges](after/edge-report.json), [display](after/display-report.json). Scripts: `tests/ux-audit.ts`, `tests/ux-edge.ts`, `tests/ux-display.ts`; audit scripts reject non-local destinations. Run with `TEST_URL` pointing to an isolated local production-build server and `node --env-file=.env --import tsx`; never point mutation suites at a real event.

Limitations: Chromium responsive/touch emulation is not real iPhone Safari/Android testing. Keyboard overlap, dictation, QR-app browser retention, screen readers, actual projection and usability with people remain untested. Browser storage denial permits participation but only in-memory retention until closing; confirmed entries recover through name/PIN. Forgotten PIN has no host reset; unsaved drafts do not transfer between browsers. No production deployment was performed.

## Five-minute physical-phone rehearsal

Use a disposable rehearsal event, an iPhone and Android, with no display open.

1. **0:00–1:00:** Open QR/link, join without drawing, then try drawing on the other phone; scroll without accidentally drawing. Recover one seat in the default browser using name/PIN.
2. **1:00–2:00:** Unlock round 1. Select a long wine name, tap 1/10 and decimal controls, type 8.3, dictate a note. Check keyboard visibility, scroll and confirmed Saved.
3. **2:00–3:00:** Disable network, edit, confirm Not saved; reconnect/retry and refresh. Revisit an earlier round and verify the viewed/current distinction. Try larger phone text settings.
4. **3:00–4:00:** Unlock remaining rounds using prepared rehearsal cards. Make a duplicate, use its jump button, correct/submit, then make an invalid edit and verify the draft warning. Host reviews incomplete guests before locking.
5. **4:00–5:00:** Lock/open guesses, reveal, browse a previous result and Follow host. Reconnect/refresh during reveal, finish and check tie ranks. Confirm notes stay private. On a later accessibility pass, use VoiceOver/TalkBack and reduced motion.
