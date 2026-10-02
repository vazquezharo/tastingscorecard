import { useEffect, useRef, useState } from "react";
import { timerRemaining, type PublicEvent } from "./shared";

export type HostControl = (
  action: string,
  extra?: Record<string, unknown>,
) => Promise<boolean>;

export function RoundClock({ event }: { event: PublicEvent }) {
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  useEffect(() => {
    offset.current = (event.serverTime ?? Date.now()) - Date.now();
    setNow(Date.now());
  }, [event.serverTime]);
  const timer = event.roundTimer;
  useEffect(() => {
    if (timer?.endsAt === undefined) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer?.endsAt]);
  if (event.phase !== "tasting" || !timer || timer.round !== event.unlocked)
    return null;
  const seconds = Math.ceil(timerRemaining(timer, now + offset.current) / 1000);
  const paused = timer.endsAt === undefined;
  return (
    <div className="round-clock" aria-label={`Round ${timer.round} timer`}>
      <span className="eyebrow">
        ROUND {timer.round} TIMER{paused ? " · PAUSED" : ""}
      </span>
      <strong role="timer" aria-live="off">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </strong>
      <p role="status">
        {seconds === 0
          ? "Time’s up · you can still edit. Wait for your host."
          : "A gentle guide · answers stay editable until the host locks."}
      </p>
    </div>
  );
}

export function TimerControls({
  event,
  disabled,
  control,
}: {
  event: PublicEvent;
  disabled: boolean;
  control: HostControl;
}) {
  const [seconds, setSeconds] = useState(180);
  const timer = event.roundTimer;
  const ended = timer
    ? timerRemaining(timer, event.serverTime ?? Date.now()) === 0
    : false;
  return (
    <details className="host-tool timer-controls">
      <summary>Round timer</summary>
      <p className="small muted">
        Optional. The timer appears on guest phones and the display. Nothing is
        submitted, locked or advanced automatically.
      </p>
      <label>
        Timer duration
        <select
          value={seconds}
          disabled={disabled}
          onChange={(e) => setSeconds(Number(e.target.value))}
        >
          {[30, 60, 120, 180, 300, 600, 900, 1800, 3600].map((s) => (
            <option key={s} value={s}>
              {s === 30
                ? "30 seconds"
                : `${s / 60} ${s === 60 ? "minute" : "minutes"}`}
            </option>
          ))}
        </select>
      </label>
      <div className="actions">
        <button
          disabled={disabled}
          onClick={() => {
            if (
              timer &&
              !window.confirm(
                "Replace the current round timer with a new countdown?",
              )
            )
              return;
            void control("timerStart", { seconds });
          }}
        >
          {timer ? "Restart timer" : "Start timer"}
        </button>
        {timer && (
          <>
            <button
              disabled={disabled || ended}
              onClick={() =>
                void control(
                  timer.endsAt === undefined ? "timerResume" : "timerPause",
                )
              }
            >
              {timer.endsAt === undefined ? "Resume timer" : "Pause timer"}
            </button>
            <button
              disabled={disabled}
              onClick={() => void control("timerStop")}
            >
              Stop timer
            </button>
          </>
        )}
      </div>
      <p className="small muted">
        Opening the next round or locking submissions clears this timer.
      </p>
    </details>
  );
}

export function PouringCorrection({
  event,
  disabled,
  control,
}: {
  event: PublicEvent;
  disabled: boolean;
  control: HostControl;
}) {
  const [key, setKey] = useState(event.key ?? []);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const saved = JSON.stringify(event.key);
  useEffect(() => {
    setKey(event.key ?? []);
    setConfirm("");
  }, [saved]);
  const changed = JSON.stringify(key) !== saved;
  const valid =
    key.length === 8 &&
    new Set(key).size === 8 &&
    key.every((w) => event.choices.includes(w));
  return (
    <details className="host-tool pouring-correction">
      <summary>Correct pouring order</summary>
      <p className="warning">
        Use this only to fix the actual pouring order, such as swapped bottles.
        All guesses, ratings, notes and submission states are kept. Scoring will
        use the corrected order. Corrections close permanently after the first
        reveal.
      </p>
      <fieldset disabled={disabled}>
        <div className="key-grid">
          {key.map((wine, i) => (
            <label key={i}>
              Corrected round {i + 1}
              <select
                aria-label={`Corrected round ${i + 1}`}
                value={wine}
                onChange={(e) =>
                  setKey((p) => p.map((w, j) => (j === i ? e.target.value : w)))
                }
              >
                {event.choices.map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {changed && (
          <div className="correction-preview">
            <h3>Review changes</h3>
            <ul>
              {key.map((w, i) =>
                w !== event.key?.[i] ? (
                  <li key={i}>
                    Round {i + 1}: {event.key?.[i]} → {w}
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        )}
        {!valid && (
          <p className="warning">Assign each wine type exactly once.</p>
        )}
        <label>
          Reason for correction
          <textarea
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label>
          Type event name to confirm correction
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          disabled={
            !valid || !changed || !reason.trim() || confirm !== event.name
          }
          onClick={async () => {
            if (await control("correctKey", { key, reason, confirm })) {
              setReason("");
              setConfirm("");
              setMessage("Pouring order corrected. Scorecards preserved.");
            } else
              setMessage(
                "Correction not confirmed saved. Review the latest order and try again.",
              );
          }}
        >
          Save corrected pouring order
        </button>
      </fieldset>
      {message && <p role="status">{message}</p>}
    </details>
  );
}

export function CorrectionHistory({ event }: { event: PublicEvent }) {
  if (!event.keyCorrections?.length) return null;
  return (
    <details className="host-tool correction-history">
      <summary>Pouring-order correction history</summary>
      <ol>
        {event.keyCorrections.map((c, i) => (
          <li key={i}>
            <p>
              <strong>{new Date(c.at).toLocaleString()}</strong> · {c.reason}
            </p>
            <p className="small muted">Tasting version {c.generation + 1}</p>
            <ul>
              {c.after.map((wine, r) =>
                wine !== c.before[r] ? (
                  <li key={r}>
                    Round {r + 1}: {c.before[r]} → {wine}
                  </li>
                ) : null,
              )}
            </ul>
          </li>
        ))}
      </ol>
    </details>
  );
}
