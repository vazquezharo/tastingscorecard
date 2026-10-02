import { BottleImage, RetailerLink } from "./reveal-display";
import { Avatar } from "./avatar";
import { validation, validRating, type PublicEvent } from "./shared";

export function FinalScorecard({ event }: { event: PublicEvent }) {
  const me = event.me!;
  const status = validation(me.entries, event.choices);
  return (
    <main className="narrow final-scorecard">
      <div className="event-line">
        <span>{event.name}</span>
        <span>
          <Avatar person={me} /> {me.name}
        </span>
      </div>
      <div className="eyebrow">YOUR SAVED ANSWERS · READ ONLY</div>
      <h1>Final Scorecard</h1>
      <p className="phase-strip" role="status">
        {me.submitted && status.valid
          ? "Submitted scorecard · editing is locked."
          : "Saved draft · not finally submitted. These ratings do not count toward group averages."}
      </p>
      <p className="muted">
        Follow the reveals at the table. Revealed answers will appear beside
        your guesses here. Your notes stay private to you and the host.
      </p>
      <ol className="personal-rounds">
        {Array.from({ length: 8 }, (_, i) => i + 1).map((round) => {
          const entry = me.entries[round];
          const revealed = event.results.find(
            (result) =>
              result.round === round &&
              round <= event.revealed &&
              !!result.wine,
          );
          const mine = revealed?.guesses.find(
            (guess) => guess.name === me.name,
          );
          return (
            <li
              className="panel personal-round"
              key={round}
              aria-label={`Your round ${round}`}
            >
              <h2>Round {round}</h2>
              <dl>
                <div>
                  <dt>Your guess</dt>
                  <dd>{entry?.guess || "No saved guess"}</dd>
                </div>
                <div>
                  <dt>Your rating</dt>
                  <dd>
                    {validRating(entry?.rating)
                      ? `${entry.rating.toFixed(1)} / 10`
                      : "No saved rating"}
                  </dd>
                </div>
              </dl>
              <p className="small muted">
                {entry ? "Saved" : "No saved entry"}
                {entry?.enteredBy === "host" ? " · Entered by host" : ""}
              </p>
              {entry?.notes && (
                <details className="personal-notes">
                  <summary>My private note</summary>
                  <p className="private-note">{entry.notes}</p>
                </details>
              )}
              {revealed ? (
                <div className="personal-answer">
                  <span className="eyebrow">REVEALED ANSWER</span>
                  <BottleImage wine={revealed} />
                  <p>
                    <strong>{revealed.wine}</strong>
                  </p>
                  <p>{revealed.producer}</p>
                  <p className="small">
                    Group average: {revealed.average?.toFixed(1) ?? "—"} / 10 ·{" "}
                    {revealed.count ?? 0} eligible ratings
                  </p>
                  <p className="small">
                    {mine?.correct
                      ? "Correct guess ✓"
                      : "No point for this guess"}
                  </p>
                  <RetailerLink wine={revealed} />
                </div>
              ) : (
                <p className="small muted unrevealed-answer">
                  Not revealed yet.
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
