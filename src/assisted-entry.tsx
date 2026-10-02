import { useCallback, useEffect, useRef, useState } from "react";
import { api, base, ApiError } from "./api";
import { Avatar } from "./avatar";
import { validRating, type AssistedEvent } from "./shared";

/** This page only calls the restricted assisted API, never private host event APIs. */
export function AssistedEntry({ id }: { id: string }) {
  const [data, setData] = useState<AssistedEvent | null>(null);
  const [selected, setSelected] = useState(
    new URLSearchParams(location.search).get("guest") || "",
  );
  const [error, setError] = useState("");
  const [authExpired, setAuthExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const onPending = useCallback(
    (key: string, value: boolean) =>
      setPending((old) =>
        old[key] === value ? old : { ...old, [key]: value },
      ),
    [],
  );
  const waiting = Object.entries(pending).some(
    ([key, value]) => key.startsWith(selected + ":") && value,
  );
  const accept = useCallback(
    (next: AssistedEvent) =>
      setData((old) => (!old || next.revision >= old.revision ? next : old)),
    [],
  );
  const refresh = useCallback(async () => {
    try {
      accept(await api<AssistedEvent>(`/events/${id}/assisted`));
      setError("");
      setAuthExpired(false);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.status === 401) setAuthExpired(true);
    }
  }, [id, accept]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api<AssistedEvent>(`/events/${id}/assisted`);
        if (!stopped) {
          accept(next);
          setError("");
          setAuthExpired(false);
        }
      } catch (err) {
        if (!stopped) {
          setError((err as Error).message);
          if (err instanceof ApiError && err.status === 401)
            setAuthExpired(true);
        }
      }
      if (!stopped) timer = setTimeout(poll, document.hidden ? 5000 : 1800);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, accept]);
  const guest = data?.guests.find((g) => g.id === selected);
  return (
    <main className="narrow assisted-entry">
      <div className="eyebrow">HOST ASSISTED ENTRY</div>
      <h1>Help a guest taste</h1>
      <p className="muted">
        This page shows guest answers only. Wine identities, producers, photos,
        correctness and results are never loaded here.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          {authExpired
            ? "Return to host controls to sign in again."
            : "Showing the last received state. Retry loading before saving."}
        </p>
      )}
      {!authExpired && (
        <button onClick={() => void refresh()}>Refresh saved scorecards</button>
      )}
      {!data ? (
        <p>
          {error
            ? "Unable to load registered guests."
            : "Loading registered guests…"}
        </p>
      ) : (
        <>
          <p>{data.name}</p>
          <label htmlFor="assisted-guest">Registered guest</label>
          <select
            id="assisted-guest"
            value={selected}
            onChange={(e) => {
              if (
                waiting &&
                !window.confirm(
                  "Discard this guest’s unsaved assisted answers and choose another guest?",
                )
              )
                return;
              setSelected(e.target.value);
            }}
          >
            <option value="">Choose a guest</option>
            {data.guests.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {!data.guests.length && <p>No registered guests yet.</p>}
          {selected && !guest && (
            <p className="warning">
              This guest is no longer registered. Choose a current guest.
            </p>
          )}
          {guest && (
            <>
              <h2>
                <Avatar person={guest} /> {guest.name}’s scorecard
              </h2>
              <p role="status">
                {guest.submitted && guest.valid
                  ? "Submitted · valid edits remain submitted until lock."
                  : "Draft · review and submit after all eight rounds."}
              </p>
              {data.phase !== "tasting" && (
                <p className="warning">
                  {data.phase === "setup"
                    ? "Wait for the host to start round 1."
                    : "Submissions locked. Saved answers are read only."}
                </p>
              )}
              {guest.duplicates.map((rounds) => (
                <p className="warning" key={rounds.join(",")}>
                  Repeated wine choice in rounds {rounds.join(" & ")}.
                </p>
              ))}
              {Array.from({ length: data.unlocked }, (_, i) => i + 1).map(
                (round) => (
                  <AssistedRound
                    key={`${guest.id}:${data.generation}:${round}`}
                    event={data}
                    guestId={guest.id}
                    round={round}
                    blocked={!!error || authExpired}
                    onSaved={accept}
                    onPending={onPending}
                  />
                ),
              )}
              <p className="small muted">
                All eight valid guesses and ratings, using every wine type once,
                are required for final submission. Guest notes are preserved and
                are not shown or edited here.
              </p>
              <button
                className="primary"
                disabled={
                  data.phase !== "tasting" ||
                  data.unlocked !== 8 ||
                  !guest.valid ||
                  guest.submitted ||
                  submitting ||
                  waiting ||
                  !!error ||
                  authExpired
                }
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Submit ${guest.name}’s saved scorecard? Check that all eight answers above are confirmed saved.`,
                    )
                  )
                    return;
                  setSubmitting(true);
                  setError("");
                  try {
                    accept(
                      await api<AssistedEvent>(
                        `/events/${id}/assisted/${guest.id}/submit`,
                        "POST",
                        {
                          entryRevisions: Array.from(
                            { length: 8 },
                            (_, i) => guest.entries[i + 1]?.revision ?? 0,
                          ),
                          generation: data.generation,
                        },
                      ),
                    );
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting
                  ? "Submitting…"
                  : waiting
                    ? "Save changed rounds before submitting"
                    : guest.submitted
                      ? "Scorecard submitted"
                      : `Submit ${guest.name}’s scorecard`}
              </button>
            </>
          )}
        </>
      )}
      <p className="small muted">
        Private host setup information is on the separate host screen.
      </p>
      <a className="button" href={`${base}/host/e/${id}`}>
        Return to private host controls
      </a>
    </main>
  );
}

function AssistedRound({
  event,
  guestId,
  round,
  blocked,
  onSaved,
  onPending,
}: {
  event: AssistedEvent;
  guestId: string;
  round: number;
  blocked: boolean;
  onSaved: (event: AssistedEvent) => void;
  onPending: (key: string, value: boolean) => void;
}) {
  const saved = event.guests.find((g) => g.id === guestId)!.entries[round];
  const [guess, setGuess] = useState(saved?.guess || "");
  const [rating, setRating] = useState<number | null>(saved?.rating ?? null);
  const [revision, setRevision] = useState(saved?.revision ?? 0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    onPending(`${guestId}:${round}`, dirty || saving || !!error);
    return () => onPending(`${guestId}:${round}`, false);
  }, [guestId, round, dirty, saving, error, onPending]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty && !saving) {
      setGuess(saved?.guess || "");
      setRating(saved?.rating ?? null);
      setRevision(saved?.revision ?? 0);
    }
  }, [saved?.revision, saved?.guess, saved?.rating, dirty, saving]);
  const changedElsewhere = dirty && (saved?.revision ?? 0) !== revision;
  const disabled = event.phase !== "tasting" || blocked || saving;
  return (
    <section
      className="panel assisted-round"
      aria-label={`Assist round ${round}`}
    >
      <h3>
        Round {round}
        {round === event.unlocked ? " · Current round" : ""}
      </h3>
      <p className="save-state" role="status">
        {saving
          ? "Saving…"
          : error
            ? "Save failed · answers retained here"
            : dirty
              ? "Unsaved changes · press Save round"
              : saved
                ? `Saved${saved.enteredBy === "host" ? " · Entered by host" : " · Entered by guest"}`
                : "No entry yet"}
      </p>
      <label htmlFor={`assist-guess-${round}`}>Wine-type guess</label>
      <select
        id={`assist-guess-${round}`}
        disabled={disabled}
        value={guess}
        onChange={(e) => {
          setGuess(e.target.value);
          setDirty(true);
        }}
      >
        <option value="">Choose a wine type</option>
        {event.choices.map((choice) => (
          <option key={choice}>{choice}</option>
        ))}
      </select>
      <label htmlFor={`assist-rating-${round}`}>Rating / 10</label>
      <input
        id={`assist-rating-${round}`}
        type="number"
        inputMode="decimal"
        min={1}
        max={10}
        step={0.1}
        disabled={disabled}
        value={rating ?? ""}
        onChange={(e) => {
          const value = e.target.value === "" ? null : Number(e.target.value);
          if (value === null || validRating(value)) {
            setRating(value);
            setDirty(true);
          }
        }}
      />
      <div className="rating-presets">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
          <button
            key={value}
            disabled={disabled}
            aria-pressed={rating === value}
            onClick={() => {
              setRating(value);
              setDirty(true);
            }}
          >
            {value.toFixed(1)}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {changedElsewhere && (
        <p className="warning">
          Another device saved this round. Your unsaved answers are still here.
          Load the latest saved answers before editing again.
        </p>
      )}
      {(changedElsewhere || error) && (
        <button
          disabled={saving}
          onClick={() => {
            if (
              dirty &&
              !window.confirm(
                "Discard these unsaved assisted answers and load the latest saved version?",
              )
            )
              return;
            setGuess(saved?.guess || "");
            setRating(saved?.rating ?? null);
            setRevision(saved?.revision ?? 0);
            setDirty(false);
            setError("");
          }}
        >
          Load latest saved answers
        </button>
      )}
      <button
        className="primary"
        disabled={disabled || !dirty || changedElsewhere}
        onClick={async () => {
          setSaving(true);
          setError("");
          try {
            const next = await api<AssistedEvent>(
              `/events/${event.id}/assisted/${guestId}/entries/${round}`,
              "PUT",
              { guess, rating, revision, generation: event.generation },
            );
            if (!alive.current) return;
            onSaved(next);
            setRevision(
              next.guests.find((g) => g.id === guestId)!.entries[round]
                .revision,
            );
            setDirty(false);
          } catch (err) {
            if (alive.current) setError((err as Error).message);
          } finally {
            if (alive.current) setSaving(false);
          }
        }}
      >
        {saving
          ? "Saving…"
          : error
            ? `Retry save round ${round}`
            : `Save round ${round}`}
      </button>
    </section>
  );
}
