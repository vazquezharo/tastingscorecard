# Baseline — pass 1

Local production-build walkthrough on 2026-10-01, isolated rehearsal SQLite file; no production data or deployment. Screens and machine-readable axe results: `before/`. Rubric defined in `RUBRIC.md` first. 23 representative screenshots plus a storage-failure reproduction. Separate host/guest/second guest/display sessions completed eight rounds, an invalid edit, override lock, reveals and final summary.

| Rubric                       |      Score | Evidence behind deductions                                                                                                                                                                                                               |
| ---------------------------- | ---------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journey clarity              |      19/25 | Earlier-round header says Round 8 while editing round 1; no explanation when a submitted card becomes a draft; missing host-key guidance and session-expiry path.                                                                        |
| Mobile interaction           |      18/25 | Join avatar takes ~500px before the join button despite being optional; recovery/editor management precedes scorecard; 1/10 require typing or many taps; full-width Clear takes an extra row. Native keyboard behavior remains untested. |
| Feedback/validation/recovery |      11/20 | Blank card says Saved; conflict offers only draft discard; duplicate/submission errors lack navigation; storage disabled blocks event loading; stale-state language lacks last-known-state warning.                                      |
| Results comprehension        |      12/15 | Follow host scrolls away; guess-stage heading is decorative; dash/0 ratings doesn't explicitly explain eligibility.                                                                                                                      |
| Accessibility/consistency    |      12/15 | Automated scans passed, but fixed-pixel fonts do not respond to root font enlargement; keyboard workflow needs stronger checks; physical screen readers remain untested.                                                                 |
| **Total**                    | **72/100** | Heuristic assessment, not a user study.                                                                                                                                                                                                  |

## Prioritized findings

| ID  | Priority | Concrete evidence                                                                                  | Focused fix                                                                                                   |
| --- | -------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| F01 | P0       | `storage-unavailable.png`: storage SecurityError prevents even loading the event                   | In-memory token/draft fallback with visible persistence warning; confirmed backend saves remain authoritative |
| F02 | P1       | `blank-round-phone.png`: empty fields have a green Saved check                                     | No entry yet until a real confirmed entry exists                                                              |
| F03 | P1       | `conflict-phone.png`: only Discard this draft and load saved version                               | Preserve draft; explicit confirmed keep/save or fetch/load choice                                             |
| F04 | P1       | `earlier-round-phone.png`: Round 8 heading, pour 1 fields                                          | Separate viewed round from host's current round; return-to-current action                                     |
| F05 | P1       | `duplicate-round-phone.png`, `submitted-to-draft-phone.png`                                        | Jump links, explicit disabled-submit reason, immediate draft-status explanation                               |
| F06 | P1       | `join-phone.png`, `blank-round-phone.png`: optional/management controls push core actions down     | Collapse optional join drawing; move management below core scorecard; reduce top spacing                      |
| F07 | P1       | Range 1–10 but shortcuts 2–9; full Clear row                                                       | Compact shortcuts include endpoints; smaller clearly labelled Clear rating                                    |
| F08 | P1       | `host-setup-phone.png`: disabled key buttons without task-specific help; expiry inferred from code | Key validation/help, pending-action message, sign-in again preserving event                                   |
| F09 | P1       | `browsing-phone.png`, `locked-guesses-phone.png`, reveal average                                   | Sticky Follow host; literal guess stage; no-eligible-rating and excluded-draft explanations                   |
| F10 | P1       | Inspection: override can hide remaining unsaved device drafts during scorecard/results switch      | Private unsaved-draft warning/details after lock; never include them in shared results                        |
| F11 | P1       | Root 200% screenshot does not enlarge fixed-pixel fonts                                            | Rem-based font sizing; retest genuine text enlargement and narrow layouts                                     |
| F12 | P2       | Forgotten PIN has no reset; create-event submit lacks pending guard                                | Explain original-browser PIN change; avoid inventing recovery authority; prevent repeat create taps           |

No answer leak or scoring/permission regression observed. Missing physical-device and assistive-technology evidence remains a limitation regardless of visual scores.
