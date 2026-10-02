import { validRating, type PublicEvent } from "./shared";
export function tasteInsights(event: PublicEvent) {
  if (!event.me || !event.summary || event.phase !== "summary") return null;
  const rows = event.summary.wines
    .flatMap((wine) => {
      const rating = event.me!.entries[wine.round]?.rating;
      if (!validRating(rating)) return [];
      return [
        {
          round: wine.round,
          wine: wine.wine!,
          producer: wine.producer,
          rating,
          average: wine.average ?? null,
          count: wine.count ?? 0,
          difference: wine.average == null ? null : rating - wine.average,
        },
      ];
    })
    .sort((a, b) => b.rating - a.rating || a.round - b.round);
  if (!rows.length)
    return { rows, favorites: [], low: null, high: null, included: false };
  return {
    rows,
    favorites: rows.filter((w) => w.rating === rows[0].rating),
    low: rows.at(-1)!.rating,
    high: rows[0].rating,
    included: event.summary.wines.some((w) =>
      w.guesses.some((g) => g.name === event.me!.name && g.ratingIncluded),
    ),
  };
}
