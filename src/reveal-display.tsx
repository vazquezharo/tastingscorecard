import { useEffect, useState } from "react";
import { Avatar } from "./avatar";
import {
  revealGuestDurationMs,
  type PublicEvent,
  type WineResult,
} from "./shared";
import { eveningStats, wineRanks } from "./reveal-stats";

export function BottleImage({ wine }: { wine: WineResult }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [wine.bottlePhoto]);
  return wine.bottlePhoto && !failed ? (
    <img
      className="signature-bottle"
      src={wine.bottlePhoto}
      alt={`${wine.producer || wine.wine} bottle`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className="bottle-fallback"
      role="img"
      aria-label="Bottle photo unavailable"
    >
      <svg viewBox="0 0 100 240" aria-hidden="true">
        <path
          d="M39 4h22v55c0 20 24 27 24 51v113q0 12-12 12H27q-12 0-12-12V110c0-24 24-31 24-51z"
          fill="currentColor"
        />
        <path d="M23 124h54v65H23z" fill="#eadfc9" />
        <path d="M38 4h24v18H38z" fill="#d6ad69" />
      </svg>
      <span>THE BLIND TASTING</span>
    </div>
  );
}
export function RetailerLink({ wine }: { wine: WineResult }) {
  // Defense in depth: no inferred URLs, credentials, or script protocols.
  let href: string | undefined;
  try {
    const url = new URL(wine.purchaseUrl || "");
    if (url.protocol === "https:" && !url.username && !url.password)
      href = url.href;
  } catch {
    /* Missing link is intentionally omitted. */
  }
  return href ? (
    <a
      className="bottle-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      Find this bottle ↗
    </a>
  ) : null;
}
function useServerClock(serverTime?: number) {
  const [sample, setSample] = useState(() => ({
    server: serverTime ?? Date.now(),
    local: Date.now(),
  }));
  const [localNow, setLocalNow] = useState(Date.now);
  useEffect(() => {
    const local = Date.now();
    if (serverTime !== undefined) setSample({ server: serverTime, local });
    setLocalNow(local);
  }, [serverTime]);
  useEffect(() => {
    const timer = window.setInterval(() => setLocalNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);
  return sample.server + localNow - sample.local;
}
export function RevealDisplay({ event }: { event: PublicEvent }) {
  return event.summary ? (
    <FinalDisplay event={event} />
  ) : (
    <StagedDisplay event={event} />
  );
}
function StagedDisplay({ event }: { event: PublicEvent }) {
  const now = useServerClock(event.serverTime);
  const round = event.presenting;
  const wine = event.results.find((w) => w.round === round);
  if (!wine)
    return (
      <main className="signature-display">
        <h1>Waiting for the host…</h1>
      </main>
    );
  const revealed = round <= event.revealed && !!wine.wine;
  const stage =
    event.revealStage?.round === round ? event.revealStage : undefined;
  const elapsed = stage ? Math.max(0, now - stage.startsAt) : Infinity;
  const guests =
    !revealed && event.parade?.round === round
      ? event.parade.guesses
      : wine.guesses;
  const visibleCount = revealed
    ? guests.length
    : Math.min(
        guests.length,
        Math.max(0, Math.floor((elapsed - 800) / revealGuestDurationMs) + 1),
      );
  const countdown =
    event.revealCountdown?.round === round ? event.revealCountdown : undefined;
  const countdownStarted =
    countdown && now >= (countdown.startsAt ?? countdown.endsAt - 3000);
  const remaining = countdown
    ? Math.max(0, Math.ceil((countdown.endsAt - now) / 1000))
    : 0;
  return (
    <main
      className={`signature-display ${revealed ? "bottle-is-revealed" : "parade-is-open"}`}
      data-round={round}
    >
      <div className="signature-heading">
        <div>
          <span className="eyebrow">{event.name}</span>
          <h1>
            Wine {round}
            <small> / 8</small>
          </h1>
        </div>
        <p
          className="signature-status"
          role="status"
          aria-label={
            countdownStarted ? `Round ${round} reveal countdown` : undefined
          }
        >
          {revealed
            ? "The bottle, revealed."
            : elapsed < 800
              ? "A glass full of possibilities."
              : countdownStarted
                ? remaining > 0
                  ? `Revealing in ${remaining}…`
                  : "Waiting for confirmed reveal…"
                : visibleCount < guests.length
                  ? "The table’s guesses"
                  : "All guesses are in. Your host will reveal the bottle."}
        </p>
      </div>
      <div className="signature-body">
        {revealed && (
          <section className="signature-identity" aria-label="Revealed bottle">
            <BottleImage wine={wine} />
            <div>
              <span className="eyebrow">THE WINE</span>
              <h2>{wine.wine}</h2>
              <p className="signature-producer">{wine.producer}</p>
              <p className="signature-average">
                {wine.average?.toFixed(1) ?? "—"}
                <small> / 10</small>
              </p>
              <p className="muted">
                Group average · {wine.count ?? 0} eligible ratings
              </p>
            </div>
          </section>
        )}
        <section
          className="parade-grid"
          aria-label="The table’s guesses"
          style={{ "--guest-count": guests.length } as React.CSSProperties}
        >
          {guests.slice(0, visibleCount).map((guest) => {
            const correct = revealed && "correct" in guest && guest.correct;
            return (
              <article
                key={`${round}-${guest.name}`}
                className={`parade-card${correct ? " parade-correct" : ""}`}
              >
                <div className="parade-person">
                  <Avatar person={guest} />
                  <strong>{guest.name}</strong>
                  {correct ? (
                    <span className="correct-mark" aria-label="Correct guess">
                      ✓
                    </span>
                  ) : null}
                </div>
                <p className="parade-guess">{guest.guess}</p>
                <p className="parade-rating">
                  {guest.rating?.toFixed(1) ?? "—"}
                  <small> / 10</small>
                  {revealed &&
                  "ratingIncluded" in guest &&
                  guest.rating != null &&
                  !guest.ratingIncluded ? (
                    <span className="draft-rating"> · Draft</span>
                  ) : null}
                </p>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
export function FinalDisplay({ event }: { event: PublicEvent }) {
  const summary = event.summary;
  if (!summary) return null;
  const champions = summary.leaderboard.filter((guest) => guest.rank === 1);
  const lowestScore = summary.leaderboard.length
    ? Math.min(...summary.leaderboard.map((guest) => guest.score))
    : undefined;
  const losers = summary.leaderboard.filter(
    (guest) => guest.score === lowestScore,
  );
  const favorites = summary.wines.filter(
    (wine) =>
      wine.average != null && wine.average === summary.wines[0]?.average,
  );
  const ranks = wineRanks(summary.wines);
  const stats = eveningStats(summary.wines);
  return (
    <main className="signature-final">
      <div className="signature-final-heading">
        <span className="eyebrow">{event.name}</span>
        <h1>An evening worth remembering.</h1>
      </div>
      <div className="signature-awards">
        <section
          className={`champion-panel${champions.length > 3 ? " many-champions" : ""}`}
        >
          <span className="eyebrow">
            TASTING CHAMPION{champions.length > 1 ? "S" : ""}
          </span>
          {champions.length ? (
            champions.map((guest) => (
              <div className="champion" key={guest.name}>
                <Avatar person={guest} />
                <div>
                  <h2>{guest.name}</h2>
                  <p>
                    {guest.score} of 8 correct
                    {guest.incomplete ? " · Incomplete card" : ""}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p>No participant scorecards.</p>
          )}
        </section>
        <section
          className={`favorite-panel${favorites.length > 2 ? " many-favorites" : ""}`}
        >
          <span className="eyebrow">
            GROUP FAVORITE{favorites.length > 1 ? "S" : ""}
          </span>
          {favorites.length ? (
            favorites.map((wine) => (
              <div className="group-favorite" key={wine.round}>
                <BottleImage wine={wine} />
                <div>
                  <h2>{wine.wine}</h2>
                  <p>{wine.producer}</p>
                  <strong>{wine.average!.toFixed(1)} / 10</strong>
                  <p>{wine.count} eligible ratings</p>
                </div>
              </div>
            ))
          ) : (
            <p>No eligible submitted ratings.</p>
          )}
        </section>
      </div>
      <section className="final-wines" aria-label="Wine rankings">
        <h2>Wine rankings</h2>
        <div className="final-wine-grid">
          {ranks.map(({ wine, rank }) => (
            <div className="final-wine-row" key={wine.round}>
              <strong className="wine-rank">{rank ?? "—"}</strong>
              <BottleImage wine={wine} />
              <div>
                <strong>{wine.wine}</strong>
                <p>{wine.producer}</p>
                <small>
                  Wine {wine.round} · {wine.count ?? 0} ratings
                </small>
              </div>
              <strong>{wine.average?.toFixed(1) ?? "—"}</strong>
            </div>
          ))}
        </div>
      </section>
      <div className="final-bottom-grid">
        <section className="evening-stats" aria-label="Tonight’s stats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <span className="eyebrow">{stat.label}</span>
              <p>{stat.text}</p>
            </div>
          ))}
        </section>
        <section
          className={`loser-panel${losers.length > 3 ? " many-losers" : ""}`}
          aria-label="Tasting losers"
        >
          <span className="eyebrow">
            TASTING LOSER{losers.length > 1 ? "S" : ""}
          </span>
          <div className="loser-guests">
            {losers.length ? (
              losers.map((guest) => (
                <div className="champion" key={guest.name}>
                  <Avatar person={guest} />
                  <div>
                    <h2>{guest.name}</h2>
                    <p>
                      {guest.score} of 8 correct
                      {guest.incomplete ? " · Incomplete card" : ""}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p>No participant scorecards.</p>
            )}
          </div>
        </section>
      </div>
      <p className="final-footnote">
        Eligible submitted ratings only · Ties share a rank · Rounded averages
        shown
      </p>
    </main>
  );
}
