import { ownsSeat } from "./identity.js";
import {
  eventChoices,
  conflicts,
  validRating,
  validation,
  type Event,
  type Participant,
  type PublicEvent,
  type WineResult,
} from "../src/shared.js";
import { producers } from "./wines.js";
function producerFor(e: Event, type: string) {
  return (
    e.wines?.find((w) => w.type === type)?.producer ?? producers[type] ?? ""
  );
}
export function correct(p: Participant, r: number, e: Event) {
  const entry = p.entries[r];
  return (
    !!entry &&
    eventChoices(e).includes(entry.guess) &&
    !conflicts(p.entries).some((rs) => rs.includes(r)) &&
    entry.guess === e.key[r - 1]
  );
}
export function wineResult(e: Event, r: number, reveal: boolean): WineResult {
  const eligible = e.participants.filter(
    (p) =>
      p.submitted &&
      validation(p.entries, eventChoices(e)).valid &&
      validRating(p.entries[r]?.rating),
  );
  const total = eligible.reduce(
    (s, p) => s + Math.round(p.entries[r].rating! * 10),
    0,
  );
  const distribution: Record<string, number> = Object.create(null);
  for (const p of e.participants) {
    const guess = p.entries[r]?.guess || "No guess";
    distribution[guess] = (distribution[guess] || 0) + 1;
  }
  return {
    round: r,
    distribution,
    guesses: e.participants.map((p) => ({
      name: p.name,
      emoji: p.emoji,
      avatar: p.avatar,
      avatarPhoto: p.avatarPhoto,
      guess: p.entries[r]?.guess || "No guess",
      ...(reveal
        ? {
            correct: correct(p, r, e),
            rating: validRating(p.entries[r]?.rating)
              ? p.entries[r].rating
              : null,
            ratingIncluded:
              p.submitted &&
              validation(p.entries, eventChoices(e)).valid &&
              validRating(p.entries[r]?.rating),
          }
        : {}),
    })),
    ...(reveal
      ? {
          wine: e.key[r - 1],
          producer: producerFor(e, e.key[r - 1]),
          bottlePhoto: e.bottlePhotos?.[e.key[r - 1]],
          count: eligible.length,
          average: eligible.length ? total / 10 / eligible.length : null,
        }
      : {}),
  };
}
export function publicEvent(
  e: Event,
  tokenHash?: string,
  host = false,
): PublicEvent {
  const now = Date.now();
  const pending =
    e.revealCountdown && e.revealCountdown.endsAt > now
      ? e.revealCountdown
      : undefined;
  const revealed = pending
    ? Math.min(e.revealed, pending.round - 1)
    : e.revealed;
  const out: PublicEvent = {
    revealCountdown: pending,
    id: e.id,
    serverTime: now,
    roundTimer: e.phase === "tasting" ? e.roundTimer : undefined,
    choices: eventChoices(e),
    name: e.name,
    phase: e.phase,
    unlocked: e.unlocked,
    revealed,
    presenting: e.presenting,
    revision: e.revision,
    generation: e.generation ?? 0,
    participants: e.participants.length,
    completed: e.participants.filter(
      (p) => p.submitted && validation(p.entries, eventChoices(e)).valid,
    ).length,
    results: [],
    seating: e.seating,
    tableGuests: e.participants.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      avatar: p.avatar,
      avatarPhoto: p.avatarPhoto,
      ready:
        e.unlocked > 0 &&
        eventChoices(e).includes(p.entries[e.unlocked]?.guess) &&
        validRating(p.entries[e.unlocked]?.rating),
    })),
  };
  const me = e.participants.find((p) => ownsSeat(p, tokenHash));
  if (me) {
    // Explicit allowlist: future stored metadata must never become guest payloads.
    const safeEntry = (entry: import("../src/shared.js").Entry) => ({
      guess: entry.guess,
      rating: entry.rating,
      notes: entry.notes,
      revision: entry.revision,
      ...(entry.enteredBy === "host" ? { enteredBy: "host" as const } : {}),
    });
    out.me = {
      id: me.id,
      name: me.name,
      emoji: me.emoji,
      avatar: me.avatar,
      avatarPhoto: me.avatarPhoto,
      draftScope: me.draftScope,
      entries: Object.fromEntries(
        Object.entries(me.entries)
          .filter(
            ([round]) =>
              Number.isInteger(Number(round)) &&
              Number(round) >= 1 &&
              Number(round) <= e.unlocked,
          )
          .map(([round, entry]) => [round, safeEntry(entry)]),
      ),
      practice: me.practice ? safeEntry(me.practice) : undefined,
      submitted: me.submitted,
      recoveryEnabled: !!me.recoveryHash,
    };
  }
  if (host) {
    out.bottlePhotos = e.bottlePhotos;
    out.wines =
      e.wines ??
      eventChoices(e).map((type) => ({
        type,
        producer: producers[type] ?? "",
      }));
    out.controlRevision = e.controlRevision ?? 0;
    out.key = e.key;
    out.keyCorrections = e.keyCorrections;
    out.roster = e.participants.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      avatar: p.avatar,
      avatarPhoto: p.avatarPhoto,
      submitted: p.submitted,
      entries: p.entries,
      correctCount: Array.from({ length: 8 }, (_, i) =>
        correct(p, i + 1, e) ? 1 : 0,
      ).reduce<number>((a, b) => a + b, 0),
      ...validation(p.entries, eventChoices(e)),
    }));
  }
  if (e.phase === "locked" || e.phase === "summary") {
    out.results = Array.from({ length: revealed }, (_, i) =>
      wineResult(e, i + 1, true),
    );
    if (e.presenting > revealed)
      out.results.push(wineResult(e, e.presenting, false));
  }
  if (e.phase === "summary" && revealed === 8 && !pending) {
    const ranked = e.participants
      .map((p) => ({
        name: p.name,
        emoji: p.emoji,
        avatar: p.avatar,
        avatarPhoto: p.avatarPhoto,
        score: Array.from({ length: 8 }, (_, i) =>
          correct(p, i + 1, e) ? 1 : 0,
        ).reduce<number>((a, b) => a + b, 0),
        rank: 0,
        incomplete:
          !p.submitted || !validation(p.entries, eventChoices(e)).valid,
      }))
      .sort((a, b) => b.score - a.score);
    ranked.forEach(
      (p, i) =>
        (p.rank =
          i > 0 && p.score === ranked[i - 1].score
            ? ranked[i - 1].rank
            : i + 1),
    );
    const wines = Array.from({ length: 8 }, (_, i) =>
      wineResult(e, i + 1, true),
    ).sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
    const rated = wines.filter((w) => w.average !== null);
    const max = ranked[0]?.score,
      min = ranked.at(-1)?.score;
    out.summary = {
      leaderboard: ranked,
      wines,
      most: ranked.filter((p) => p.score === max).map((p) => p.name),
      fewest: ranked.filter((p) => p.score === min).map((p) => p.name),
      highest: rated
        .filter((w) => w.average === rated[0]?.average)
        .map((w) => w.wine!),
      lowest: rated
        .filter((w) => w.average === rated.at(-1)?.average)
        .map((w) => w.wine!),
    };
  }
  return out;
}
export function csv(e: Event) {
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [
    [
      "participant",
      "round",
      "wine_type",
      "producer",
      "guess",
      "correct",
      "rating",
      "notes",
      "submitted",
      "complete",
    ],
    ...e.participants.flatMap((p) =>
      Array.from({ length: 8 }, (_, i) => {
        const r = i + 1;
        return [
          p.name,
          r,
          e.key[i],
          producerFor(e, e.key[i]),
          p.entries[r]?.guess || "",
          correct(p, r, e),
          p.entries[r]?.rating ?? "",
          p.entries[r]?.notes || "",
          p.submitted,
          validation(p.entries, eventChoices(e)).valid,
        ];
      }),
    ),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}

export function assistedEvent(
  e: Event,
): import("../src/shared.js").AssistedEvent {
  return {
    id: e.id,
    name: e.name,
    phase: e.phase,
    unlocked: e.unlocked,
    revision: e.revision,
    generation: e.generation ?? 0,
    choices: eventChoices(e),
    guests: e.participants.map((p) => ({
      id: p.id,
      name: p.name,
      submitted: p.submitted,
      ...validation(p.entries, eventChoices(e)),
      entries: Object.fromEntries(
        Object.entries(p.entries)
          .filter(
            ([round]) =>
              Number.isInteger(Number(round)) &&
              Number(round) >= 1 &&
              Number(round) <= e.unlocked,
          )
          .map(([round, entry]) => [
            round,
            {
              guess: entry.guess,
              rating: entry.rating,
              revision: entry.revision,
              ...(entry.enteredBy === "host"
                ? { enteredBy: "host" as const }
                : {}),
            },
          ]),
      ),
    })),
  };
}
