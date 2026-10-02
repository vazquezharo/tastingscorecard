# The Blind Tasting: Purpose and Expected Behavior

Updated: October 2, 2026  
Current behavioral specification, including the staged end-of-tasting reveal, final Event Display, optional avatars, personal Final Scorecard, and host-assisted entry.

- App: https://tasting.haroldvazquez.com
- Host: https://tasting.haroldvazquez.com/host

## 1. Purpose

The app replaces paper scorecards for a private, eight-round blind wine tasting. It helps guests record their guesses and preferences, gives the host control over the evening, and turns the reveal into a shared experience.

The experience should support:

- Simple participation from a guest’s phone, without creating an account.
- Blind tasting without exposing the pouring order, producers, or bottle photos early.
- Reliable saving, browser recovery, and clear submission status.
- Host-controlled rounds and reveals at the table’s pace.
- Fair scoring and wine rankings based on eligible submitted ratings.
- Personal reflections and a shareable keepsake after the tasting.

The Guest App runs primarily on phones. The private Host Console is optimized for an iPad in portrait or landscape. The optional read-only Event Display runs in its own laptop/TV browser window; it is never a mirrored Host Console. The entire event still works without a TV. The tasting app operates separately from the main website.

## 2. Roles and Visibility

| Role | Expected access |
|---|---|
| Guest App | Join or recover their seat, edit their own unlocked scorecard, view opened results, and see their own final taste insights. |
| Host Console | Create and configure events, manage guests and seating, control rounds and reveals, inspect saved guest scorecards, and export results. |
| Event Display | Show the invitation, table/readiness, and opened reveals/results. It does not control the event. |

An event link is a private invitation rather than an account-based access boundary. Anyone given that link can access its public views and, while registration is open, join. Host operations require server-validated host authentication.

## 3. Event Stages

| Stage | Expected behavior |
|---|---|
| Setup | Host configures wines, bottle photos, pouring order, and seating. Guests can join and try practice. |
| Tasting | Host unlocks eight rounds sequentially. Guests save and edit unlocked answers and eventually submit their complete scorecards. |
| Locked / reveals | Scorecard editing stops. Phones switch to read-only personal scorecards. Host alternates opening guesses and revealing each wine. |
| Final summary | Personal insights appear below the Final Scorecard. Shared rankings and recap controls are available in an expandable section. Results remain revisitable. |

Refreshing, opening the display, or closing the display does not advance the event.

## 4. Host Setup

The host signs in, creates a named event, and receives an invitation link and QR code.

Each event contains exactly eight distinct wine-type choices. The host may customize wine types and producers during setup. The default choices are:

1. Pinot Noir
2. Grenache
3. Rosso di Montepulciano
4. Malbec
5. Chianti Classico
6. Tempranillo
7. Cabernet Sauvignon
8. Merlot

This list is a set of answer choices, not the pouring order. The host separately assigns each wine type once to the actual order of pours, rounds 1–8.

Optional bottle photos attach to wine types. They preserve their aspect ratio, are resized, and are re-encoded without image metadata before storage. The host should save wine-list edits before uploading photos. Guests receive each photo only when its wine is revealed.

Wine types, producers, bottle photos, and the ordinary pouring-order editor freeze when tasting starts. Changing wine types during setup clears an answer key that no longer matches the choices; producer-only changes retain it.

## 5. Guest Joining and Recovery

A new guest joins with:

- A unique display name within the event.
- An optional avatar: a drawing or uploaded photo. Skipping it automatically uses the guest’s initials.

Drawing supports colors, Undo, Clear, and touch/mouse/keyboard input. Avatar photos are cropped for the avatar, resized, and re-encoded without metadata. Guests can update their avatar while scorecard editing remains open.

The browser retains a token so refreshes normally restore the same participant. A guest using another browser can choose **Recover my seat**, select their existing display name and request host approval. The private Host Console shows Approve/Deny; choosing a name alone never authenticates the browser. Requests expire after 15 minutes and survive refresh. Recovery restores the same participant and backend-confirmed answers, rather than creating another guest.

Unsaved drafts stay in their original browser and do not transfer through recovery. The app cannot force a QR scanner to open Safari or Chrome.

The host can also **Create recovery link** from a guest’s scorecard. The one-use link expires after 10 minutes and is shared only with that guest. A replacement invalidates the previous unused link; successful redemption consumes it atomically. Opening or refreshing a link does not redeem it. Recovery preserves existing sessions, avatar, confirmed answers/private notes, practice, seating and submission state. After lock, recovery grants read-only access; it cannot unlock editing. No PIN creation, entry, change or reset remains. Recovery metadata and credentials never reach Event Display or other guests. Abusive recovery attempts are rate-limited.

## 6. Waiting and Practice

Before round 1 starts, a registered guest can try an optional private practice round using the real guess, rating, notes, and save controls.

Practice:

- Saves separately from the eight scored rounds.
- Is visible to its owner rather than in shared results.
- Does not affect points, readiness, submission, group averages, or CSV results.
- Ends when the host starts tasting.

## 7. Tasting and Saving

Each unlocked round accepts:

- One wine-type guess from the event’s eight choices.
- A rating from **1.0 to 10.0**, in **0.1 increments**.
- Optional private notes.

Ratings start blank. Whole-number buttons offer quick entry; decimal adjustment controls and direct entry allow finer ratings.

The host unlocks rounds one at a time. Future rounds remain unavailable. Guests can revisit and edit any unlocked round until the host locks submissions, including after final submission.

Answers autosave after a short input delay. **Saved** means the backend confirmed the answer. Unsaved, saving, failure, and retry states should remain distinguishable. A timeout is not proof of a successful save.

Failed saves retain a local draft and offer retry; reconnect also retries. If another browser changes the same answer, revision checks prevent a silent overwrite and the guest receives conflict-resolution controls.

Duplicate guesses may be saved as drafts. Warnings identify conflicting rounds and offer navigation to fix them; the app does not change guesses automatically.

## 8. Readiness, Seating, and Timing

The host sees the current round’s ready count and waiting guest names.

**Ready** means an allowed guess and valid rating for the current round are confirmed saved. It does not mean the full scorecard is submitted, and it does not lock that round. Clearing an answer returns the guest to Waiting. Opening a new round evaluates readiness for that new round.

The host can arrange a round, square, or rectangular table with 2–20 seats. Each guest can be assigned once. Seating persists; unassigned guests remain visible, and removing a guest clears their assignment.

During tasting, the optional display shows guest names, avatars, seating, and Ready/Waiting status. Its readiness data excludes guesses, ratings, notes, correctness, and producers. Event Display automatically adapts the table layout to the viewport, seat count and timer, without on-screen controls. Existing seating remains host-configured and persistent.

An optional round timer supports start/restart, pause/resume, and stop, with durations from 30 seconds to 60 minutes. It appears on host, guest, and display screens and persists through refresh. Expiry is only a prompt: it never submits, locks, or advances a round. Advancing the tasting round or locking clears it.

## 9. Review, Submission, and Locking

Before final submission, guests review all eight rounds together. The review identifies missing answers, invalid ratings, duplicate guesses, unopened rounds, and pending saves, with controls to return to a round.

Final submission requires:

- Eight valid wine-type guesses, using every choice exactly once.
- Eight valid ratings.
- Backend-confirmed saves for the answers being submitted.

A submitted card remains editable until the host locks. Valid edits retain submission; invalid edits return the card to draft status and require correction and resubmission.

Host Console shows current round, total guests, Ready/Waiting names, submitted count and live timer separately from administration. Touch controls are at least 48px; the next action is prominent. The host must unlock all eight rounds before locking. Missing, invalid, and unsubmitted cards are named in warnings. A deliberate host override can lock despite those warnings. The UI also requires explicit confirmation before locking, including counts and that edits end immediately. Pending saves on other devices cannot be detected; the host must ask guests to wait for Saved.

Locking stops scorecard and avatar edits on the server and automatically moves recognized guests to their read-only Final Scorecard. All eight rounds show saved guesses, ratings, status, and expandable private notes. Unsaved local drafts do not become official answers at lock; a private panel on the original device allows the guest to inspect them.

## 10. Reveals

Locking opens round 1’s saved guess parade without its wine identity or correctness. The display receives final saved guesses and ratings through a separate restricted parade payload only after lock. The host then:

1. Reveals that wine.
2. Opens the next round’s guesses.
3. Reveals the next wine.
4. Repeats through all eight rounds.
5. Explicitly opens the final summary.

The host can choose an immediate reveal or an optional three-second countdown. The countdown’s saved server deadline survives refresh. Wine identity, producer, bottle photo, correctness, purchase links and group averages are withheld from guest/display responses until that deadline. Final saved guesses and ratings are already allowed in the post-lock parade. Next-round and summary controls cannot bypass it.

Reduced-motion preferences disable countdown animation. Polling and network delays can affect when each screen sees the countdown or confirmed reveal. The app waits for confirmed reveal data instead of guessing the answer locally.

Revealed results show wine identity, producer, optional photo, guesses, correctness, individual ratings, eligible group average, and rating count.

The read-only Event Display uses a server-persisted round intro/parade timeline: guests appear at 0.8-second intervals, stay visible, and the selected optional countdown begins after the parade. Refresh joins the saved timeline. The host queues each reveal and controls every next round. Legacy rounds without a timeline show their cards immediately. After server-confirmed reveal, the bottle is the centerpiece, with exact identity, eligible average/count, and gentle correct-guess checkmarks. The display sends no event-control requests. Guest phones primarily show their personal Final Scorecard, adding revealed answers, producer, bottle photo/fallback, eligible group average/count and an exact supplied HTTPS retailer link progressively. Unrevealed rounds never show answer/correctness, producers, photos, purchase URLs, group averages, or rankings. After final summary opens, personal insights appear and guests can expand **Final rankings & evening recap**. Anonymous event viewers retain the existing public opened-results view. Refresh/recovery restores the saved stage and personal scorecard.

The host must explicitly open Final Summary after reveal 8. Until then the public API provides no overall leaderboard or cumulative score. The final display shows all tied champions, all tied eligible group favorites, all eight ranked wines, and reliable secondary evening stats. Wine ranks retain unrounded-average competition ties; unrated wines have no rank. Small displays use compact layouts for many ties, with secondary stats omitted when they would crowd the core results.

## 11. Scoring and Wine Rankings

Each valid, correct, non-conflicting round guess earns one point, for a maximum of eight. Missing, unknown, and duplicate-conflicting guesses earn no points. Valid unique guesses can still earn points on an incomplete card.

Group wine averages use ratings from **valid, finally submitted scorecards only**. Missing ratings are not zero. Saved draft ratings may appear after reveal, but are marked and excluded from averages.

Wine rankings use full, unrounded averages; displayed averages use one decimal place. Wines with no eligible ratings show **—** and cannot win highest/lowest-rated distinctions.

Equal leaderboard scores share a competition rank, such as **1, 1, 3**. Tied highest/lowest ratings and most/fewest correct distinctions include all matching wines or guests. Incomplete cards are labelled.

## 12. Personal Taste Insights and Evening Recap

At final results, a recovered or recognized guest sees **Your taste, by the glass**, including:

- Their highest-rated wines, including all tied favorites.
- Their saved rating range and number of ratings.
- Each personal rating compared with the eligible group average.
- Whether their ratings contributed to group averages.

Personal insights describe this evening’s saved ratings, rather than a general palate profile. With no eligible group ratings, no comparison is invented. This panel is absent from anonymous and display views.

**Take the evening home** creates a preview and downloadable PNG containing the event name, all eight wines/producers, group averages, and group favorites. A named leaderboard is optional and excluded by default. Private notes and personal insights are always excluded. Image generation takes place in the browser.

## 13. Host Management and Corrections

Clicking a guest’s name/avatar opens their live, read-only saved scorecard for the host, including private notes and validation status. The read-only viewer does not rewrite answers. A separate **Assist** link opens host-assisted entry.

Before the first reveal, a separate pouring-order correction requires a valid eight-wine permutation, reason, and exact event-name confirmation. It preserves scorecards, submission state, seating, and round progress. Its timestamped before/after history remains host-only.

Before any reveal, the existing explicit reset requires the exact event name. It clears scored answers, practice, submission status, the answer key, and round progress; retains guests and seating; and starts a new tasting generation. Wine configuration and bottle photos are retained. An event whose reveal has started cannot be reset through this flow.

The host can remove a guest after confirming the guest’s name. Removal deletes their participant data, revokes their tokens/recovery, clears their seat, and recalculates results. It does not ban someone from deliberately rejoining while registration is open.

After locking, the host can download CSV containing saved scorecards, notes, submission/completeness flags, and the answer key. It may include identities that guests have not yet seen, so it is a private host export.

### Tonight-specific bottles

`server/tonight-bottles.ts` is a server-only, one-evening configuration. Its default is inactive: no event ID or exact bottle data was supplied with this request. Eight bottle entries must match the configured event ID and its entire saved pouring order. A different event or changed order gets no overlay. Missing photos use a generic fallback; missing links are omitted. No retailer searches or guessed URLs are generated. No new bottle-management UI or database migration is introduced. The existing optional host photo tool remains available.

### Host-assisted entry

The authenticated host chooses a registered guest on a separate, spoiler-minimized page. The page’s restricted API never returns the key, correctness, producers, bottle photos, purchase links, reveal results, group averages, rankings, or private notes. It shows only guest names, saved guesses/ratings, revisions, submission validity, and unlocked-round information.

The host can save guesses and ratings for unlocked rounds during tasting. **Save round** is explicit; unsaved, saving, saved, and failed states are labelled. Guest notes are preserved. Host-entered responses are marked; scoring is unchanged. Conflicting guest/host edits are rejected rather than overwritten. Failed assisted drafts remain in the open editor for retry; they are not durable across a page reload.

The host can review and submit a complete assisted scorecard using the same eight-round validation. Pending changes block submission. Submission checks the selected guest’s answer revisions, so another participant’s independent save does not invalidate it. Reset generations, guest removal, round access, authentication, request origin, and event lock remain enforced. After locking, assisted answers are read only.

## 14. Privacy, Persistence, and Synchronization

- Notes are accessible to their owner and the host’s scorecard/CSV, not other guests, the display, or the recap.
- Unrevealed answers and bottle photos are withheld by the server, not merely hidden in the interface.
- Host actions, round access, ownership, and locking are enforced by the backend.
- Production event state persists in Neon PostgreSQL; SQLite supports local rehearsal.
- Screens synchronize through short polling, usually about 1.8 seconds in active tabs and 5 seconds in background tabs.
- Refresh and host reauthentication preserve saved event state.
- Existing event links and completed results remain available unless the event is deliberately deleted.
- Normal app updates should preserve existing events, the database, and the separate main website.

## 15. Verification and Practical Limits

The staged reveal build passed 37 server/unit tests, feature browser rehearsals, and a full eight-round event using independent mobile browser sessions without a display. Live read-only checks confirmed PostgreSQL health, mobile host/summary rendering, recap generation, and preservation of the existing eight-guest demo.

Physical iPhone/Android/TV testing, actual camera/file picking, in-app browser downloads, and a full room of simultaneous production users remain unverified. Automated accessibility checks passed for tested screens, but do not establish comprehensive accessibility certification.

Tonight’s practical operating expectations: use a regular phone browser, ask the host to approve recovery when switching browsers, wait for Saved, distinguish round readiness from final submission, verify the physical pouring order, and resolve submission warnings before locking.

## 16. Three application surfaces

Canonical Event Display: `https://tasting.haroldvazquez.com/display/e/<EVENT_ID>`; legacy `/projector/e/<EVENT_ID>` remains an alias. Host Console links open the canonical route. Waiting screens emphasize the group-chat invitation with QR as an alternate option and registered avatars/initials. Tasting screens show only round/event/timer/readiness; no hints, guesses, ratings or results. The display contains no controls and opening/refresh/reconnect/close makes no mutation. See [three-surface changes and tonight setup](THREE-SURFACES.md). Existing reveal functionality is retained; this phase adds no further reveal animations or final scoreboard changes.
