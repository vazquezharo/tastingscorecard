# Intended experience

## Purpose and devices

A private eight-round blind wine tasting for roughly 10–12 guests, replacing paper scorecards. Phones are the primary guest device; the host uses a laptop or phone. An optional big-screen display follows the same saved event. The full event works without a projector. The existing website and separate AI sommelier project remain independent.

## Guest journey

Guests open the invitation, register a unique display name and private 4–6 digit recovery PIN, and choose a required avatar by drawing an icon in a large drawing area or uploading a photo. Ink colors, Undo and Clear support touch/mouse drawing; new guests must add a drawing or photo before joining; existing initial/emoji icons remain compatible. Before tasting starts, guests wait for the host and can optionally try a private practice round with the same confirmed-save controls. Practice ends when round 1 starts, never affects scores/readiness, and is saved separately.

Each unlocked round accepts one wine-type guess, a 1.0–10.0 rating in 0.1 increments, and optional private notes compatible with phone keyboard dictation. The quick buttons select 1.0–10.0; decimal +/- controls, direct input and Clear are available. No rating is prefilled. New rounds become active, and earlier unlocked rounds remain editable. Future rounds remain hidden.

The default choices are Pinot Noir, Grenache, Rosso di Montepulciano, Malbec, Chianti Classico, Tempranillo, Cabernet Sauvignon and Merlot. These are distinct wine types, not eight distinct grapes or the pouring order. Producers and bottle images remain hidden during tasting.

Blank rounds say No entry yet. Entries autosave with confirmed Saved states. Duplicate guesses identify conflicting rounds with jump buttons, without changing answers automatically. Drafts may be incomplete or duplicate; final submission requires eight guesses, eight valid ratings and every wine choice once. Before final submission, guests review all eight guesses and ratings together with missing/duplicate/save-status warnings and Edit round buttons. Submitted cards remain editable until locking; invalid edits return them to draft status with an immediate explanation and resubmission guidance.

Locking automatically replaces phone scorecards with results. Guests follow the host by default, can browse opened rounds, and use the persistent Follow host button to return to the current presentation. Future results and unrevealed identities remain inaccessible. Refresh resumes the saved presentation stage, with manual browsing selection resetting to following the host.

## Host journey and screens

The host signs in with a password, creates/reopens an event, optionally customizes its eight wine types and producers using Edit event wines, then privately assigns each wine once, shares the invitation, starts round 1 and sequentially unlocks further rounds. The roster shows counts, avatars and submission status. During tasting, the round controls show the current-round confirmed ready count and waiting guest names, using the same readiness as the optional display. Readiness does not lock answers. Clicking a guest opens a host-only, read-only live scorecard with confirmed guesses, ratings, private notes, correctness and validation status. The popup updates automatically and warns when disconnected. Before locking, missing, invalid or unsubmitted cards are named. An explicit override permits locking despite these warnings.

Locking opens round 1’s guess breakdown. The host reveals its wine, then opens the next round’s guesses. Reveal shows wine type, producer, correct guesses, average, rating count and individual ratings. After eight reveals, the host explicitly opens the final summary and can privately download CSV results.

An explicit reset before any reveal clears scorecards and the key while retaining seats. The wine list and ordinary key editor are frozen after starting. A separate, confirmed host correction can fix the pouring order before the first reveal while preserving scorecards and recording a private before/after history. Changing a wine type during setup clears a saved key that no longer matches; producer-only edits retain the key. Custom wines persist for that event and appear in guesses, scoring, reveals and CSV. Confirmed guest removal permanently deletes a seat and its data and recalculates results; it is not a ban on deliberate rejoining while registration remains open.

Main screens: invitation entry; join/recovery; waiting/scorecard; host event list and controls; phone reveals/final rankings; optional display with QR/progress and automatic reveals.

## Results, privacy and persistence

One point per valid correct guess, maximum eight. Missing and duplicate-conflicting guesses score zero; valid unique guesses on incomplete cards can still score. Only valid, finally submitted scorecards contribute ratings to averages. Missing ratings are not zero; excluded draft ratings are marked. Rankings use unrounded averages, display one decimal and share ranks for ties. Results persist and remain revisitable. Notes stay private to their owner and the host’s live scorecard/CSV; spotlighting is not implemented.

## State handling and recovery

Loading and empty screens explain pending access, waiting rounds or absent ratings. Save states distinguish unsaved, saving, confirmed save and failure. Failed drafts remain in their original browser with retry/reconnect recovery; concurrent edits explicitly offer keeping and saving the retained draft or loading the latest server version, with confirmation. QR scanners choose their browser: the app cannot force Safari. Name/PIN recovery restores the same seat and confirmed entries in another browser without duplication. Older seats need a PIN set before losing their original browser; a host can replace a forgotten PIN after confirming identity in person, preserving the seat and saved scorecard. Repeated failed recovery attempts cause a temporary lockout.

## Style, accessibility and observed gaps

Preserve a dark wine-bar style, warm gold accents, readable text, generous targets, labelled controls, visible keyboard focus, status messages, avatars, text enlargement, narrow-screen reflow and reduced-motion support.

Expired host sessions offer sign-in recovery without losing the event. Unavailable browser storage permits temporary participation with a warning to keep the tab open and recover confirmed saves through name/PIN. Avatar drawing/photo editing and session management sit below the core scorecard. Joining requires a drawing or photo; recovering an existing seat reuses its avatar. Photo upload previews a square crop, resizes the image and strips metadata before persistence. Avatar photos appear on rosters, reveals and rankings. Drawing tools have generous targets, Undo and Clear; keyboard arrows position the pen and Space adds points. Unsaved drafts do not transfer across browsers or contribute after locking; a private locked-draft panel preserves their visibility on the original device. Automated browser/persistence checks passed, but actual Safari/Android keyboards, QR-reader behavior, dictation, drawing and comprehensive accessibility testing remain unverified. Treat these as uncertainties rather than claiming certification.

## Gentle timing and adaptive displays

The optional host-controlled round timer appears on guest phones and the display. Start/restart, pause/resume and stop persist across refresh. Expiry is a prompt, never an automatic submit, lock or round advance. Opening the next round or locking clears it.

The display offers Automatic, Table map and Compact seats. Crowded tables and smaller viewports use numbered compact cards that preserve seating order, avatars, full guest names and readiness. Browser preference persists; unassigned guests remain visible. Forced table view and very narrow screens may require scrolling.

## The reveal and the keepsake

The host can attach optional bottle photos during setup and choose a synchronized three-second countdown for each reveal. Unrevealed wine identities/photos remain server-private until the countdown deadline. Reduced motion disables animation. Countdown completion never opens the next round automatically.

Final results include private personal favorites (including ties), saved rating range and comparisons against the group’s eligible submitted averages. A separate evening-recap preview downloads a polished PNG with the title, wines, producers, group averages/favorites and an opt-in named leaderboard. Notes and personal insights never enter the recap. The display stays focused on reveal/results rather than download controls.
