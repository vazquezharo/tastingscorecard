import type { WineResult } from "./shared";
export function wineRanks(wines: WineResult[]) {
  const sorted = [...wines].sort(
    (a, b) => (b.average ?? -1) - (a.average ?? -1),
  );
  let previous: number | null | undefined,
    rank = 0;
  return sorted.map((wine, i) => {
    if (wine.average == null) return { wine, rank: null };
    if (wine.average !== previous) rank = i + 1;
    previous = wine.average;
    return { wine, rank };
  });
}
export function eveningStats(wines: WineResult[]) {
  const stats: { label: string; text: string }[] = [];
  // Identification uses exactly the existing correct flags (including valid
  // partial-card guesses). Ignore missing guesses; count actual responses.
  const identified = wines.map((wine) => ({
    wine,
    count: wine.guesses.filter((g) => g.guess !== "No guess").length,
    correct: wine.guesses.filter((g) => g.correct === true).length,
  }));
  const sameCount =
    identified.length === 8 &&
    identified.every((w) => w.count > 0 && w.count === identified[0].count);
  if (sameCount) {
    const max = Math.max(...identified.map((w) => w.correct));
    const min = Math.min(...identified.map((w) => w.correct));
    for (const [label, value] of [
      ["Most correctly identified", max],
      ["Fooled the most people", min],
    ] as const) {
      const tied = identified.filter((w) => w.correct === value);
      // All-eight ties are uninformative; omit rather than fill the screen.
      if (tied.length < 8)
        stats.push({
          label,
          text:
            tied.map((w) => `Wine ${w.wine.round}`).join(" · ") +
            ` (${value} of ${identified[0].count} correct)`,
        });
    }
  }
  const eligible = wines.flatMap((wine) =>
    wine.guesses
      .filter((g) => g.ratingIncluded === true && g.rating != null)
      .map((g) => ({ round: wine.round, rating: g.rating! })),
  );
  if (eligible.length) {
    const highest = Math.max(...eligible.map((g) => g.rating));
    const rounds = [
      ...new Set(
        eligible.filter((g) => g.rating === highest).map((g) => g.round),
      ),
    ];
    stats.push({
      label: "Highest individual rating",
      text: `${highest.toFixed(1)} / 10 · ${rounds.map((r) => `Wine ${r}`).join(" · ")}`,
    });
  }
  const spreads = wines.flatMap((wine) => {
    const ratings = wine.guesses
      .filter((g) => g.ratingIncluded === true && g.rating != null)
      .map((g) => Math.round(g.rating! * 10));
    return ratings.length >= 2
      ? [
          {
            round: wine.round,
            spread: Math.max(...ratings) - Math.min(...ratings),
          },
        ]
      : [];
  });
  if (spreads.length) {
    const widest = Math.max(...spreads.map((w) => w.spread));
    const ties = spreads.filter((w) => w.spread === widest);
    if (widest > 0 && ties.length < 8)
      stats.push({
        label: "Biggest rating disagreement",
        text: `${ties.map((w) => `Wine ${w.round}`).join(" · ")} · ${(widest / 10).toFixed(1)} points apart`,
      });
  }
  return stats;
}
