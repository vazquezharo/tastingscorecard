import { RevealDisplay } from "./reveal-display";
import { AssistedEntry } from "./assisted-entry";
import { FinalScorecard } from "./final-scorecard";
import {
  BottlePhotos,
  RevealCountdown,
  TasteInsights,
  EveningRecap,
} from "./evening-tools";
import {
  readLocal,
  writeLocal,
  removeLocal,
  hasDurableStorage,
} from "./storage";
import {
  RoundClock,
  TimerControls,
  PouringCorrection,
  CorrectionHistory,
  PinReset,
  type HostControl,
} from "./host-tools";
import { SeatingEditor, TableDisplay } from "./seating";
import { PhotoPicker } from "./photo-picker";
import { Avatar, DrawingPad } from "./avatar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, base, browserToken, ApiError } from "./api";
import {
  type EventWine,
  type HostParticipant,
  conflicts,
  validation,
  validRating,
  type AvatarDrawing,
  type Entry,
  type PublicEvent,
  type WineResult,
} from "./shared";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/400-italic.css";
import "./style.css";
const link = (s: string) => base + s;
function Header({ mode = "Private tasting" }: { mode?: string }) {
  return (
    <header>
      <a href={link("/")} className="brand">
        <span className="brand-mark">B</span>
        <span>THE BLIND TASTING</span>
      </a>
      <span className="mode">{mode}</span>
    </header>
  );
}
function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="error">
      {message}
    </div>
  );
}
function useEvent(id: string, host = false, projector = false) {
  const [data, setData] = useState<PublicEvent | null>(null),
    [error, setError] = useState(""),
    [authExpired, setAuthExpired] = useState(false);
  const alive = useRef(true);
  const accept = useCallback(
    (next: PublicEvent) =>
      setData((prev) =>
        !prev || next.revision >= prev.revision ? next : prev,
      ),
    [],
  );
  const refresh = useCallback(async () => {
    try {
      const next = await api<PublicEvent>(
        `/events/${id}${host ? "?host=1" : projector ? "?view=projector" : ""}`,
      );
      if (alive.current) {
        accept(next);
        setError("");
        setAuthExpired(false);
      }
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        if (host && e instanceof ApiError && e.status === 401)
          setAuthExpired(true);
      }
    }
  }, [id, host, projector, accept]);
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function poll() {
      await refresh();
      if (!stopped) timer = setTimeout(poll, document.hidden ? 5000 : 1800);
    }
    void poll();
    const online = () => void refresh();
    window.addEventListener("online", online);
    return () => {
      stopped = true;
      alive.current = false;
      clearTimeout(timer);
      window.removeEventListener("online", online);
    };
  }, [refresh]);
  return { data, error, refresh, accept, authExpired };
}
function Home() {
  const [invite, setInvite] = useState("");
  return (
    <>
      <Header />
      <main className="home narrow">
        <div className="eyebrow">EIGHT WINES · ONE GOOD EVENING</div>
        <h1>
          Trust your
          <br />
          <em>taste.</em>
        </h1>
        <p className="muted">
          Join your host’s private blind tasting. Your guesses stay between you
          and your scorecard until the reveal.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const id = invite.match(/(?:\/e\/)?([a-f0-9]{32})\/?$/)?.[1];
            if (id) location.href = link(`/e/${id}`);
            else
              alert(
                "Use the complete event link or 32-character event code from your host.",
              );
          }}
        >
          <label htmlFor="invite">Event link or code</label>
          <input
            id="invite"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="Paste your invitation"
            required
          />
          <button className="primary">Join tasting</button>
        </form>
        <a className="quiet" href={link("/host")}>
          Hosting tonight? Open host controls
        </a>
        <div className="home-footer">
          <span>01 — TASTE</span>
          <span>02 — GUESS</span>
          <span>03 — REVEAL</span>
        </div>
      </main>
    </>
  );
}
function Join({
  event,
  onJoined,
  recoveryOnly = false,
}: {
  event: PublicEvent;
  onJoined: (e: PublicEvent) => void;
  recoveryOnly?: boolean;
}) {
  const [name, setName] = useState(""),
    [pin, setPin] = useState(""),
    [returning, setReturning] = useState(recoveryOnly),
    [avatar, setAvatar] = useState<AvatarDrawing>([]),
    [avatarPhoto, setAvatarPhoto] = useState(""),
    [photoBusy, setPhotoBusy] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="narrow join">
      <div className="eyebrow">YOU’RE INVITED</div>
      <h1>{event.name}</h1>
      <p className="muted">
        Eight pours. Eight wine types. Make each choice your own.
      </p>
      {!recoveryOnly && (
        <div className="actions" role="group" aria-label="Join or recover">
          <button
            type="button"
            aria-pressed={!returning}
            className={!returning ? "selected" : ""}
            onClick={() => {
              setReturning(false);
              setError("");
            }}
          >
            New guest
          </button>
          <button
            type="button"
            aria-pressed={returning}
            className={returning ? "selected" : ""}
            onClick={() => {
              setReturning(true);
              setError("");
            }}
          >
            Recover my seat
          </button>
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            onJoined(
              await api(
                `/events/${event.id}/${returning ? "recover" : "join"}`,
                "POST",
                returning ? { name, pin } : { name, pin, avatar, avatarPhoto },
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="name">Your name</label>
        <input
          id="name"
          autoComplete="nickname"
          maxLength={40}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="How should we call you?"
        />
        <label htmlFor="guest-pin">
          {returning ? "Your recovery PIN" : "Create a recovery PIN"}
        </label>
        <input
          id="guest-pin"
          type="password"
          inputMode="numeric"
          autoComplete={returning ? "current-password" : "new-password"}
          pattern="[0-9]{4,6}"
          minLength={4}
          maxLength={6}
          required
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <p className="small muted">
          4–6 digits. Use your display name and PIN to recover this seat in
          another browser. Keep your PIN private.
        </p>
        {!returning && (
          <details className="join-avatar" aria-labelledby="join-avatar-title">
            <summary id="join-avatar-title">Add an avatar (optional)</summary>
            <h2>Make your seat your own</h2>
            <p className="small muted">
              Draw an icon or upload a photo, or skip this and use your
              initials.
            </p>
            <PhotoPicker
              value={avatarPhoto}
              onBusy={setPhotoBusy}
              disabled={busy}
              onChange={(photo) => {
                setAvatarPhoto(photo);
                if (photo) setAvatar([]);
              }}
            />
            {!avatarPhoto && (
              <DrawingPad
                value={avatar}
                onChange={setAvatar}
                disabled={busy || photoBusy}
              />
            )}
            <p id="avatar-help" className="small" role="status">
              {avatarPhoto
                ? "Your photo is ready."
                : avatar.length
                  ? "Your drawing is ready."
                  : "No avatar selected. Your initials will be used."}
            </p>
          </details>
        )}
        {!returning && !avatar.length && !avatarPhoto && (
          <p className="initials-preview small">
            <Avatar person={{ name: name.trim() || "Guest" }} /> Your initials
            will be used. You can add an avatar later.
          </p>
        )}
        <p className="small muted">
          {returning
            ? "Forgot your PIN? If your original browser still remembers your seat, open Session recovery & event link there to set a new PIN. You can also ask your host to reset your PIN after confirming your identity in person."
            : "Remember your name and PIN before leaving this page."}
        </p>
        {error && <ErrorBox message={error} />}
        <button
          className="primary"
          disabled={busy || photoBusy}
          aria-describedby={!returning ? "avatar-help" : undefined}
        >
          {busy
            ? returning
              ? "Recovering…"
              : "Joining…"
            : returning
              ? "Recover scorecard"
              : "Take my seat"}
        </button>
      </form>
      <p className="small muted">
        This browser remembers your seat. If a QR reader loses the page, open
        this event link in Safari or your preferred browser and choose Recover
        my seat.
      </p>
    </main>
  );
}
type Draft = Pick<Entry, "guess" | "rating" | "notes">;
function RoundCard({
  event,
  round,
  active,
  entry,
  onDraft,
  onBusy,
  onSaved,
  practice = false,
}: {
  practice?: boolean;
  event: PublicEvent;
  round: number;
  active: boolean;
  entry: Entry | undefined;
  onDraft: (r: number, d: Draft) => void;
  onBusy: (r: number, b: boolean) => void;
  onSaved: (e: PublicEvent) => void;
}) {
  const canEdit = practice
    ? event.phase === "setup"
    : event.phase === "tasting";
  const savedEntry = (e: PublicEvent) =>
    practice ? e.me!.practice : e.me!.entries[round];
  const legacyKey = `tasting.draft.v1:${event.id}:${event.generation}:${browserToken()}:${round}`;
  const storageKey = `${legacyKey}:${event.me!.id}`;
  const initial = useRef<{
    draft: Draft;
    revision: number;
    pending: boolean;
  } | null>(null);
  if (!initial.current) {
    let stored;
    try {
      stored = JSON.parse(readLocal(storageKey) || "null");
      if (!stored && !event.me!.draftScope) {
        const legacy = readLocal(legacyKey);
        if (legacy) {
          stored = JSON.parse(legacy);
          writeLocal(storageKey, legacy);
          removeLocal(legacyKey);
        }
      }
    } catch {}
    initial.current = stored
      ? { draft: stored.draft, revision: stored.revision, pending: true }
      : {
          draft: {
            guess: entry?.guess || "",
            rating: entry?.rating ?? null,
            notes: entry?.notes || "",
          },
          revision: entry?.revision || 0,
          pending: false,
        };
  }
  const [draft, setDraft] = useState<Draft>(initial.current.draft),
    [status, setStatus] = useState(
      initial.current.pending
        ? "Unsaved changes"
        : entry
          ? "Saved"
          : "No entry yet",
    ),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [resolving, setResolving] = useState(false);
  const latest = useRef(draft),
    revision = useRef(initial.current.revision),
    pending = useRef(initial.current.pending),
    saving = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    locked = useRef(!canEdit),
    saveRef = useRef<() => Promise<void>>(async () => {});
  locked.current = !canEdit;
  const save = useCallback(async () => {
    if (saving.current || !pending.current || locked.current) return;
    saving.current = true;
    setStatus("Saving…");
    setError("");
    const snapshot = latest.current;
    try {
      const updated = await api<PublicEvent>(
        practice
          ? `/events/${event.id}/practice`
          : `/events/${event.id}/entries/${round}`,
        "PUT",
        { ...snapshot, revision: revision.current },
      );
      revision.current = savedEntry(updated)!.revision;
      onSaved(updated);
      setConflict(false);
      if (latest.current === snapshot) {
        pending.current = false;
        removeLocal(storageKey);
        setStatus("Saved");
        onBusy(round, false);
      } else {
        writeLocal(
          storageKey,
          JSON.stringify({ draft: latest.current, revision: revision.current }),
        );
        setStatus("Unsaved changes");
      }
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "Another device saved this round. Your draft is still here."
          : (e as Error).message,
      );
      setStatus("Not saved");
      setConflict(e instanceof ApiError && e.status === 409);
    } finally {
      saving.current = false;
      if (
        pending.current &&
        !locked.current &&
        !error &&
        latest.current !== snapshot
      )
        timer.current = setTimeout(() => void saveRef.current(), 300);
    }
  }, [event.id, round, onSaved, onBusy, storageKey, error, practice]);
  saveRef.current = save;
  useEffect(() => {
    if (pending.current) {
      onDraft(round, latest.current);
      onBusy(round, true);
      timer.current = setTimeout(() => void saveRef.current(), 300);
    }
    const reconnect = () => void saveRef.current();
    window.addEventListener("online", reconnect);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("online", reconnect);
    };
  }, [onDraft, onBusy, round]);
  useEffect(() => {
    if (
      !pending.current &&
      !saving.current &&
      entry &&
      entry.revision > revision.current
    ) {
      revision.current = entry.revision;
      latest.current = {
        guess: entry.guess,
        rating: entry.rating,
        notes: entry.notes,
      };
      setDraft(latest.current);
      setStatus("Saved");
      onDraft(round, latest.current);
    }
  }, [entry, onDraft, round]);
  const change = (d: Draft) => {
    latest.current = d;
    setDraft(d);
    pending.current = true;
    setStatus("Unsaved changes");
    onDraft(round, d);
    onBusy(round, true);
    writeLocal(
      storageKey,
      JSON.stringify({ draft: d, revision: revision.current }),
    );
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(), 550);
  };
  const disabled = !canEdit;
  return (
    <section hidden={!active} className="round-card">
      <div className="card-top">
        <span className="eyebrow">
          {practice
            ? "PRACTICE · NOT SCORED"
            : `POUR ${String(round).padStart(2, "0")}`}
        </span>
        <span
          className={`save-state ${status === "Saved" ? "confirmed" : ""}`}
          aria-live="polite"
        >
          {status === "Saved" ? "✓ " : ""}
          {disabled && pending.current ? "Unsaved — tasting locked" : status}
        </span>
      </div>
      <h2>{practice ? "Try your scorecard" : "What’s in your glass?"}</h2>
      {practice && (
        <p className="muted">
          Choose any wine type, try a whole-number rating and the decimal
          controls, then add a note. Wait for “Saved”. Practice is private and
          never counts toward scores or round readiness.
        </p>
      )}
      <label htmlFor={`guess-${round}`}>Your wine-type guess</label>
      <select
        id={`guess-${round}`}
        disabled={disabled}
        value={draft.guess}
        onChange={(e) => change({ ...draft, guess: e.target.value })}
      >
        <option value="">Choose a wine type</option>
        {event.choices.map((w) => (
          <option key={w}>{w}</option>
        ))}
      </select>
      <div className="rating-head">
        <label htmlFor={`rating-${round}`}>Your rating</label>
        <span className="small muted">1.0 – 10.0</span>
        <button
          type="button"
          className="clear-rating"
          disabled={disabled || draft.rating === null}
          onClick={() => change({ ...draft, rating: null })}
        >
          Clear rating
        </button>
      </div>
      <div className="rating-control">
        <button
          type="button"
          aria-label="Decrease rating"
          disabled={disabled || draft.rating === null || draft.rating <= 1}
          onClick={() =>
            change({
              ...draft,
              rating: Math.max(1, Math.round((draft.rating! - 0.1) * 10) / 10),
            })
          }
        >
          −
        </button>
        <input
          id={`rating-${round}`}
          aria-label="Your rating"
          type="number"
          inputMode="decimal"
          min="1"
          max="10"
          step="0.1"
          placeholder="—"
          disabled={disabled}
          value={draft.rating ?? ""}
          onChange={(e) => {
            const n = e.target.value === "" ? null : Number(e.target.value);
            if (n === null || validRating(n)) change({ ...draft, rating: n });
          }}
        />
        <button
          type="button"
          aria-label="Increase rating"
          disabled={disabled || draft.rating === null || draft.rating === 10}
          onClick={() =>
            change({
              ...draft,
              rating:
                draft.rating === null
                  ? 5
                  : Math.min(10, Math.round((draft.rating + 0.1) * 10) / 10),
            })
          }
        >
          +
        </button>
        <span className="out-of">/ 10</span>
      </div>
      <div className="rating-presets">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button
            type="button"
            disabled={disabled}
            key={n}
            aria-pressed={draft.rating === n}
            className={draft.rating === n ? "selected" : ""}
            onClick={() => change({ ...draft, rating: n })}
          >
            {n.toFixed(1)}
          </button>
        ))}
      </div>
      <label htmlFor={`notes-${round}`}>
        Tasting notes <span className="muted">(optional)</span>
      </label>
      <textarea
        id={`notes-${round}`}
        disabled={disabled}
        rows={3}
        maxLength={2000}
        value={draft.notes}
        onChange={(e) => change({ ...draft, notes: e.target.value })}
        placeholder="Aroma, texture, a feeling…"
      />
      <p className="small muted">
        Your phone keyboard’s dictation works here, too.
      </p>
      {error && (
        <>
          <ErrorBox message={error} />
          {conflict ? (
            <div className="conflict-actions">
              <p className="small">
                Your draft is still here. Another device saved a different
                version. Choose which version to keep.
              </p>
              <button
                type="button"
                disabled={disabled || resolving}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Save this device’s draft instead of the version saved by your other device?",
                    )
                  )
                    return;
                  setResolving(true);
                  try {
                    const current = await api<PublicEvent>(
                      `/events/${event.id}`,
                    );
                    revision.current = savedEntry(current)?.revision || 0;
                    onSaved(current);
                    writeLocal(
                      storageKey,
                      JSON.stringify({
                        draft: latest.current,
                        revision: revision.current,
                      }),
                    );
                    await saveRef.current();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setResolving(false);
                  }
                }}
              >
                Keep my draft and save
              </button>
              <button
                type="button"
                disabled={resolving}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Discard this device’s unsaved draft and load the latest saved version? This cannot be undone.",
                    )
                  )
                    return;
                  setResolving(true);
                  try {
                    const current = await api<PublicEvent>(
                      `/events/${event.id}`,
                    );
                    const saved = savedEntry(current);
                    const d = {
                      guess: saved?.guess || "",
                      rating: saved?.rating ?? null,
                      notes: saved?.notes || "",
                    };
                    revision.current = saved?.revision || 0;
                    latest.current = d;
                    pending.current = false;
                    removeLocal(storageKey);
                    setConflict(false);
                    setError("");
                    setDraft(d);
                    onDraft(round, d);
                    onBusy(round, false);
                    setStatus(saved ? "Saved" : "No entry yet");
                    onSaved(current);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setResolving(false);
                  }
                }}
              >
                Load saved version
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => void save()}
            >
              Retry save
            </button>
          )}
        </>
      )}
    </section>
  );
}
function PracticeRound({
  event,
  onSaved,
}: {
  event: PublicEvent;
  onSaved: (e: PublicEvent) => void;
}) {
  const ignoreDraft = useCallback(() => {}, []);
  const ignoreBusy = useCallback(() => {}, []);
  return (
    <details className="practice-round">
      <summary>Try a practice round</summary>
      <RoundCard
        event={event}
        round={0}
        practice
        active
        entry={event.me!.practice}
        onDraft={ignoreDraft}
        onBusy={ignoreBusy}
        onSaved={onSaved}
      />
    </details>
  );
}
function Scorecard({
  event,
  onSaved,
}: {
  event: PublicEvent;
  onSaved: (e: PublicEvent) => void;
}) {
  const [active, setActive] = useState(event.unlocked || 1),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [busy, setBusy] = useState<Record<string, boolean>>({}),
    [error, setError] = useState(""),
    [submitting, setSubmitting] = useState(false),
    [reviewing, setReviewing] = useState(false);
  useEffect(() => {
    if (reviewing) {
      const title = document.getElementById("review-title");
      title?.focus();
      title?.scrollIntoView({ block: "start" });
    }
  }, [reviewing]);
  const lastUnlocked = useRef(event.unlocked);
  useEffect(() => {
    if (event.unlocked > lastUnlocked.current) {
      setActive(event.unlocked);
      lastUnlocked.current = event.unlocked;
    }
  }, [event.unlocked]);
  const onDraft = useCallback(
      (r: number, d: Draft) => setDrafts((p) => ({ ...p, [r]: d })),
      [],
    ),
    onBusy = useCallback(
      (r: number, b: boolean) => setBusy((p) => ({ ...p, [r]: b })),
      [],
    );
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatar, setAvatar] = useState<AvatarDrawing>(event.me!.avatar || []);
  const [avatarPhoto, setAvatarPhoto] = useState(event.me!.avatarPhoto || "");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const entries = { ...event.me!.entries };
  for (const [r, d] of Object.entries(drafts))
    entries[r] = { ...d, revision: entries[r]?.revision || 0 };
  const valid = validation(entries, event.choices);
  const waiting = Object.values(busy).some(Boolean);
  const previouslySubmitted = useRef(event.me!.submitted);
  if (event.me!.submitted) previouslySubmitted.current = true;
  const returnedToDraft =
    previouslySubmitted.current && (!valid.valid || !event.me!.submitted);
  const openMissing = valid.missing.filter((r) => r <= event.unlocked);
  return (
    <main className="scorecard narrow">
      <div className="event-line">
        <span>{event.name}</span>
        <span>
          <Avatar person={event.me!} /> {event.me!.name}
        </span>
      </div>
      <div className="score-title">
        <div>
          <div className="eyebrow">YOUR SCORECARD</div>
          <h1>
            {event.phase === "setup" ? (
              "A good night awaits."
            ) : event.phase === "tasting" ? (
              <>
                Round {active}
                <em> of eight.</em>
              </>
            ) : (
              "Pencils down."
            )}
          </h1>
        </div>
      </div>
      <div className="phase-strip">
        {event.phase === "setup"
          ? "Your host will open the first round shortly."
          : event.phase === "tasting"
            ? active === event.unlocked
              ? `Current round ${event.unlocked} · earlier rounds are editable`
              : `Editing round ${active} · host is on round ${event.unlocked}`
            : "Submissions are locked · follow the reveals below"}
      </div>
      {active !== event.unlocked && event.phase === "tasting" && (
        <button
          className="return-current"
          onClick={() => setActive(event.unlocked)}
        >
          Go to current round {event.unlocked}
        </button>
      )}
      {event.phase === "tasting" && <RoundClock event={event} />}
      {event.phase === "setup" && (
        <PracticeRound event={event} onSaved={onSaved} />
      )}
      {event.unlocked > 0 && (
        <>
          <nav className="round-nav" aria-label="Unlocked rounds">
            {Array.from({ length: event.unlocked }, (_, i) => i + 1).map(
              (r) => (
                <button
                  key={r}
                  className={active === r ? "active" : ""}
                  aria-pressed={active === r}
                  onClick={() => setActive(r)}
                >
                  <span>{String(r).padStart(2, "0")}</span>
                  <span className="round-marker">
                    {entries[r]?.guess && validRating(entries[r]?.rating)
                      ? "✓"
                      : "·"}
                  </span>
                </button>
              ),
            )}
          </nav>
          {Array.from({ length: event.unlocked }, (_, i) => i + 1).map((r) => (
            <RoundCard
              key={r}
              event={event}
              round={r}
              active={active === r}
              entry={event.me!.entries[r]}
              onDraft={onDraft}
              onBusy={onBusy}
              onSaved={onSaved}
            />
          ))}
          {conflicts(entries).map((rs) => (
            <div className="warning" key={rs.join(",")}>
              Repeated wine type in rounds {rs.join(" & ")}. Choose a different
              wine type for one of these rounds.
              <div className="actions">
                {rs.map((r) => (
                  <button key={r} onClick={() => setActive(r)}>
                    Go to round {r}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {returnedToDraft && (
            <p className="warning" role="status">
              Your edited scorecard is now a draft. Fix the highlighted rounds
              and submit again before the host locks.
            </p>
          )}
          <div className="submission">
            <div>
              <strong>
                {event.me!.submitted && !waiting && valid.valid
                  ? "Scorecard submitted"
                  : "Your final scorecard"}
              </strong>
              <p className="small muted">
                {event.phase === "tasting"
                  ? "Use all eight wine types once. You can keep editing until the host locks."
                  : event.me!.submitted
                    ? "Your submitted scorecard is saved."
                    : "This scorecard was locked without a valid final submission."}
              </p>
            </div>
            {event.phase === "tasting" && (
              <button
                type="button"
                aria-expanded={reviewing}
                aria-controls="scorecard-review"
                onClick={() => setReviewing((p) => !p)}
              >
                {reviewing ? "Close review" : "Review scorecard"}
              </button>
            )}
            {event.phase === "tasting" && reviewing && (
              <section
                id="scorecard-review"
                className="scorecard-review"
                aria-labelledby="review-title"
              >
                <h2 id="review-title" tabIndex={-1}>
                  Review all eight rounds
                </h2>
                <p className="small muted">
                  Check your guesses and ratings before submitting. Editing
                  stays open until the host locks.
                </p>
                <ol className="review-rounds">
                  {Array.from({ length: 8 }, (_, i) => i + 1).map((r) => {
                    const entry = entries[r];
                    const duplicate = valid.duplicates.some((rs) =>
                      rs.includes(r),
                    );
                    const missing = valid.missing.includes(r);
                    return (
                      <li
                        key={r}
                        className={
                          missing || duplicate ? "needs-attention" : ""
                        }
                      >
                        <div>
                          <strong>Round {r}</strong>
                          <span>{entry?.guess || "Missing guess"}</span>
                          <span>
                            {validRating(entry?.rating)
                              ? `${entry.rating!.toFixed(1)} / 10`
                              : "Missing rating"}
                          </span>
                          <small className={busy[r] ? "warning-text" : "muted"}>
                            {r > event.unlocked
                              ? "Not open yet"
                              : busy[r]
                                ? "Changes not confirmed saved"
                                : event.me!.entries[r]
                                  ? "Saved answers"
                                  : "No entry yet"}
                            {missing && r <= event.unlocked
                              ? " · Needs a valid guess and rating"
                              : ""}
                            {duplicate ? " · Repeated wine choice" : ""}
                          </small>
                        </div>
                        <button
                          type="button"
                          disabled={r > event.unlocked}
                          onClick={() => {
                            setActive(r);
                            setReviewing(false);
                            requestAnimationFrame(() =>
                              document.getElementById(`guess-${r}`)?.focus(),
                            );
                          }}
                        >
                          Edit round {r}
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <button
                  className="primary"
                  aria-describedby="submission-help"
                  disabled={
                    event.unlocked < 8 || !valid.valid || waiting || submitting
                  }
                  onClick={async () => {
                    setSubmitting(true);
                    setError("");
                    try {
                      onSaved(
                        await api(`/events/${event.id}/submit`, "POST", {}),
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                >
                  {submitting
                    ? "Submitting…"
                    : waiting
                      ? "Waiting for saves…"
                      : event.me!.submitted
                        ? "Submitted ✓"
                        : "Submit scorecard"}
                </button>
              </section>
            )}
            <p id="submission-help" className="small muted">
              {waiting
                ? "Wait for all changes to be saved before submitting."
                : event.unlocked < 8
                  ? "Drafts save automatically. Final submission opens after all eight rounds are unlocked."
                  : !valid.valid
                    ? "Finish the missing guesses/ratings and resolve repeated wine types to submit."
                    : event.me!.submitted
                      ? "Submitted. Valid edits stay submitted; you can edit until locking."
                      : "Your drafts are saved. Review your scorecard, then submit your final answers."}
            </p>
            {openMissing.length > 0 && (
              <div className="missing-rounds">
                <span className="small">Needs a guess or rating:</span>
                {openMissing.map((r) => (
                  <button key={r} onClick={() => setActive(r)}>
                    Round {r}
                  </button>
                ))}
              </div>
            )}
            {event.unlocked === 8 && !valid.valid && (
              <p className="small warning-text">
                {valid.missing.length
                  ? `Complete guesses and ratings in rounds ${valid.missing.join(", ")}. `
                  : ""}
                {valid.duplicates.length
                  ? "Resolve repeated wine types to submit."
                  : ""}
              </p>
            )}
            {error && <ErrorBox message={error} />}
          </div>
        </>
      )}
      {event.phase !== "locked" && event.phase !== "summary" && (
        <details
          open={editingAvatar}
          className="avatar-editor"
          onToggle={(e) => setEditingAvatar(e.currentTarget.open)}
        >
          <summary>Draw or edit your icon</summary>
          <PhotoPicker
            value={avatarPhoto}
            onBusy={setPhotoBusy}
            disabled={avatarSaving}
            onChange={(photo) => {
              setAvatarPhoto(photo);
              if (photo) setAvatar([]);
            }}
          />
          {!avatarPhoto && (
            <DrawingPad
              value={avatar}
              onChange={setAvatar}
              disabled={avatarSaving || photoBusy}
            />
          )}
          {avatarError && <ErrorBox message={avatarError} />}
          <button
            type="button"
            disabled={
              avatarSaving || photoBusy || (!avatar.length && !avatarPhoto)
            }
            onClick={async () => {
              setAvatarSaving(true);
              setAvatarError("");
              try {
                onSaved(
                  await api<PublicEvent>(`/events/${event.id}/avatar`, "PUT", {
                    avatar,
                    avatarPhoto,
                  }),
                );
                setEditingAvatar(false);
              } catch (e) {
                setAvatarError((e as Error).message);
              } finally {
                setAvatarSaving(false);
              }
            }}
          >
            {avatarSaving ? "Saving icon…" : "Save icon"}
          </button>
        </details>
      )}
    </main>
  );
}
function RecoverySettings({
  event,
  onSaved,
}: {
  event: PublicEvent;
  onSaved: (e: PublicEvent) => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="narrow recovery-settings">
      <details>
        <summary>
          {event.me!.recoveryEnabled
            ? "Session recovery & event link"
            : "Set a PIN so you can recover your seat"}
        </summary>
        <p className="small muted">
          Your seat: <strong>{event.me!.name}</strong>. Reopen this event in any
          browser, choose Recover my seat, and enter this name and your PIN.
          Your saved ratings, guesses and drawing come back.
        </p>
        <p className="small">
          <a href={link(`/e/${event.id}`)}>Bookmark this event link</a>
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            setError("");
            try {
              onSaved(
                await api<PublicEvent>(`/events/${event.id}/pin`, "PUT", {
                  pin,
                }),
              );
              setPin("");
              setMessage("Recovery PIN saved. Remember your name and PIN.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="set-pin">
            {event.me!.recoveryEnabled
              ? "New recovery PIN"
              : "Create a recovery PIN"}
          </label>
          <input
            id="set-pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="[0-9]{4,6}"
            minLength={4}
            maxLength={6}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <p className="small muted">
            4–6 digits. Set this before leaving a QR reader’s browser.
          </p>
          <button disabled={busy}>
            {busy ? "Saving PIN…" : "Save recovery PIN"}
          </button>
        </form>
        {message && <p role="status">{message}</p>}
        {error && <ErrorBox message={error} />}
      </details>
      {!event.me!.recoveryEnabled && (
        <p className="small warning">
          This seat has no recovery PIN yet. Set one before switching browsers.
        </p>
      )}
    </div>
  );
}
function LockedDrafts({ event }: { event: PublicEvent }) {
  const unsaved: { round: number; draft: Draft }[] = [];
  for (let round = 1; round <= 8; round++) {
    try {
      const key = `tasting.draft.v1:${event.id}:${event.generation}:${browserToken()}:${round}:${event.me!.id}`;
      const stored = JSON.parse(readLocal(key) || "null");
      const saved = event.me!.entries[round];
      if (
        stored?.draft &&
        (!saved ||
          ["guess", "rating", "notes"].some(
            (k) => stored.draft[k] !== saved[k as keyof Entry],
          ))
      )
        unsaved.push({ round, draft: stored.draft });
    } catch {
      /* Ignore malformed old draft data; authoritative entries remain intact. */
    }
  }
  return unsaved.length ? (
    <div className="narrow">
      <section className="warning" aria-label="Unsaved edits after lock">
        <strong>Submissions locked before some edits were saved.</strong>
        <p className="small">
          These device drafts were not included in results. Only
          backend-confirmed entries count.
        </p>
        <details>
          <summary>View my unsaved drafts (private)</summary>
          {unsaved.map(({ round, draft }) => (
            <div key={round}>
              <h3>Round {round}</h3>
              <p>
                {draft.guess || "No guess"} · {draft.rating ?? "No rating"}
              </p>
              <p className="private-note">{draft.notes}</p>
            </div>
          ))}
        </details>
      </section>
    </div>
  ) : null;
}
function Guest({ id }: { id: string }) {
  const { data, error, accept, refresh } = useEvent(id);
  const resultsOpen = data?.phase === "locked" || data?.phase === "summary";
  useEffect(() => {
    if (resultsOpen) window.scrollTo({ top: 0, behavior: "instant" });
  }, [resultsOpen]);
  return (
    <>
      <Header
        mode={
          resultsOpen && data?.me
            ? "Final scorecard"
            : resultsOpen
              ? "Tasting results"
              : "Guest scorecard"
        }
      />
      {error && (
        <div className="narrow">
          <ErrorBox
            message={`${error} ${data ? "Showing the last received state; it may be out of date. Reconnecting…" : "Check the invitation link or retry."}`}
          />
        </div>
      )}
      {!hasDurableStorage() && (
        <div className="narrow">
          <p className="warning" role="status">
            This browser cannot keep your seat or drafts after closing. Keep
            this tab open, wait for Saved, and use your name and PIN to recover
            in another browser.
          </p>
        </div>
      )}
      {data?.me && !data.me.recoveryEnabled && (
        <div className="narrow">
          <p className="small warning">
            Set a recovery PIN below before leaving this browser.
          </p>
        </div>
      )}
      {data?.me && resultsOpen && <LockedDrafts event={data} />}
      {data && resultsOpen && !data.me && (
        <details className="narrow recovery-settings">
          <summary>Recover my seat</summary>
          <Join event={data} onJoined={accept} recoveryOnly />
        </details>
      )}
      {!data ? (
        <main className="narrow">
          {error ? (
            <>
              <p>Unable to open this tasting.</p>
              <button onClick={() => void refresh()}>Retry loading</button>
            </>
          ) : (
            "Loading tasting…"
          )}
        </main>
      ) : resultsOpen && data.me ? (
        <>
          <FinalScorecard event={data} />
          {data.summary && (
            <div className="narrow">
              <TasteInsights event={data} />
              <details className="final-shared-results">
                <summary>Final rankings & evening recap</summary>
                <Results event={{ ...data, me: undefined }} />
              </details>
            </div>
          )}
        </>
      ) : resultsOpen ? (
        <Results event={data} />
      ) : !data.me ? (
        <Join event={data} onJoined={accept} />
      ) : (
        <Scorecard event={data} onSaved={accept} />
      )}
      {data?.me && <RecoverySettings event={data} onSaved={accept} />}
    </>
  );
}
function RevealCard({ wine }: { wine: WineResult }) {
  return (
    <section className="reveal-card">
      <div className="eyebrow">
        ROUND {String(wine.round).padStart(2, "0")} ·{" "}
        {wine.wine ? "REVEALED" : "THE GUESSES ARE IN"}
      </div>
      {wine.wine ? (
        <div key={wine.wine} className="wine-revealed">
          <h1>{wine.wine}</h1>
          {wine.bottlePhoto && (
            <img
              className="revealed-bottle"
              src={wine.bottlePhoto}
              alt={`${wine.wine} bottle`}
            />
          )}
          <p className="producer">{wine.producer}</p>
          <div className="average">
            <strong>{wine.average?.toFixed(1) ?? "—"}</strong>
            <span>
              GROUP AVERAGE / 10
              <br />
              {wine.count
                ? `${wine.count} submitted ratings`
                : "No eligible ratings"}
            </span>
          </div>
        </div>
      ) : (
        <>
          <h1>Round {wine.round} guesses</h1>
          <p className="muted">
            Your host will reveal the wine next. Ratings appear after the
            reveal.
          </p>
        </>
      )}
      <div className="reveal-grid">
        <div>
          <h2>What the room guessed</h2>
          <div className="distribution">
            {Object.entries(wine.distribution)
              .sort((a, b) => b[1] - a[1])
              .map(([guess, count]) => (
                <div key={guess}>
                  <span>{guess}</span>
                  <span
                    className="bar"
                    style={{
                      width: `${Math.max(5, (count / Math.max(1, wine.guesses.length)) * 100)}%`,
                    }}
                  />
                  <strong>{count}</strong>
                </div>
              ))}
          </div>
        </div>
        <div>
          <h2>Around the table</h2>
          <div className="guess-list">
            {wine.guesses.map((p) => (
              <div key={p.name} className={p.correct ? "correct" : ""}>
                <span>
                  <Avatar person={p} /> {p.name}
                </span>
                <span>
                  {p.guess}
                  {p.correct ? " ✓" : ""}
                </span>
                {wine.wine && (
                  <strong>
                    {p.rating?.toFixed(1) ?? "—"}
                    {p.rating !== null && !p.ratingIncluded ? " *" : ""}
                  </strong>
                )}
              </div>
            ))}
          </div>
          {wine.wine &&
            wine.guesses.some(
              (p) => p.rating !== null && !p.ratingIncluded,
            ) && (
              <p className="small muted">
                * Saved draft rating · not included in the average. Only valid,
                submitted scorecards count.
              </p>
            )}
        </div>
      </div>
    </section>
  );
}
function Summary({
  event,
  interactive = true,
}: {
  event: PublicEvent;
  interactive?: boolean;
}) {
  const s = event.summary!;
  return (
    <section className="summary">
      <div className="eyebrow">THE FINAL POUR</div>
      <h1>
        A night to <em>remember.</em>
      </h1>
      <TasteInsights event={event} />
      {interactive && <EveningRecap event={event} />}
      <div className="summary-grid">
        <div className="panel">
          <h2>The leaderboard</h2>
          {s.leaderboard.map((p) => (
            <div className="leader-row" key={p.name}>
              <span className="rank">{p.rank}</span>
              <span>
                <Avatar person={p} /> {p.name}
                {p.incomplete && <small>Incomplete scorecard</small>}
              </span>
              <strong>
                {p.score}
                <small>/ 8</small>
              </strong>
            </div>
          ))}
          <div className="small muted awards">
            <p>Most correct: {s.most.join(", ") || "—"}</p>
            <p>Fewest correct: {s.fewest.join(", ") || "—"}</p>
          </div>
        </div>
        <div className="panel">
          <h2>The room’s favorites</h2>
          {s.wines.map((w) => (
            <div className="wine-row" key={w.round}>
              <div>
                <strong>{w.wine}</strong>
                <small>
                  {w.producer} · Round {w.round}
                </small>
              </div>
              <div className="wine-score">
                {w.average?.toFixed(1) ?? "—"}
                <small>{w.count} ratings</small>
              </div>
            </div>
          ))}
          <div className="small muted awards">
            <p>
              Highest rated: {s.highest.join(", ") || "No submitted ratings"}
            </p>
            <p>Lowest rated: {s.lowest.join(", ") || "No submitted ratings"}</p>
          </div>
        </div>
      </div>
      <p className="small muted">
        Ties share a rank. Valid unique guesses still earn points on incomplete
        cards. Wine rankings use full averages; displayed averages are rounded.
        Unsubmitted ratings are excluded.
      </p>
    </section>
  );
}
function Results({
  event,
  projector = false,
}: {
  event: PublicEvent;
  projector?: boolean;
}) {
  const [selected, setSelected] = useState<number | "summary" | null>(null);
  const following = projector || selected === null;
  const showSummary = !!event.summary && (following || selected === "summary");
  const round = following ? event.presenting : selected;
  const result = event.results.find((r) => r.round === round);
  return (
    <main className={projector ? "projector-main" : "results-main"}>
      {!projector && (
        <>
          <div className="results-heading">
            <p>
              {event.me && <Avatar person={event.me} />}
              {event.me?.name || event.name}
            </p>
            <p className="muted small" role="status">
              {following
                ? "Following host"
                : `Viewing ${showSummary ? "final rankings" : `round ${round}`}`}
              {event.summary
                ? " · Final rankings are open"
                : ` · Host is on round ${event.presenting}`}
            </p>
            <button
              className={following ? "selected" : ""}
              aria-pressed={following}
              onClick={() => setSelected(null)}
            >
              Follow host
            </button>
          </div>
          <nav className="result-nav" aria-label="Opened results">
            {event.results.map((r) => (
              <button
                key={r.round}
                onClick={() => setSelected(r.round)}
                aria-pressed={!showSummary && round === r.round}
                className={!showSummary && round === r.round ? "selected" : ""}
              >
                Round {r.round}
                {r.wine ? " ✓" : ""}
              </button>
            ))}
            {event.summary && (
              <button
                className={showSummary ? "selected" : ""}
                aria-pressed={showSummary}
                onClick={() => setSelected("summary")}
              >
                Final rankings
              </button>
            )}
          </nav>
        </>
      )}
      {showSummary ? (
        <Summary event={event} interactive={!projector} />
      ) : event.revealCountdown && round === event.revealCountdown.round ? (
        <RevealCountdown event={event} />
      ) : result ? (
        <RevealCard wine={result} />
      ) : (
        <p>Waiting for your host to open results…</p>
      )}
    </main>
  );
}

function Projector({ id }: { id: string }) {
  const { data, error } = useEvent(id, false, true);
  return (
    <div className={`projector${data?.phase === "locked" || data?.phase === "summary" ? " signature-projector" : ""}`}>
      <Header mode="At the table" />
      {error && (
        <div className="narrow">
          <ErrorBox
            message={`Connection interrupted. Showing the last received state; it may be out of date. ${error}`}
          />
        </div>
      )}
      {!data ? (
        <main>Loading…</main>
      ) : data.phase === "locked" || data.phase === "summary" ? (
        <RevealDisplay event={data} />
      ) : (
        <main className="projector-lobby seating-lobby">
          <div>
            <div className="eyebrow">{data.name}</div>
            <h1>
              {data.phase === "setup" ? (
                <>
                  Take your
                  <br />
                  <em>seat.</em>
                </>
              ) : (
                <>
                  Round {data.unlocked}
                  <em> of eight.</em>
                </>
              )}
            </h1>
            <p className="muted">
              {data.phase === "setup"
                ? "Scan to join the tasting."
                : "Taste, take a guess, make a note."}
            </p>
          </div>
          <div className="qr-panel">
            <img
              src={link(`/api/events/${id}/qr`)}
              alt="QR code to join the tasting"
            />
            <h2>Join the tasting</h2>
            <p>
              Open your camera.
              <br />
              Scan. Enter your name.
            </p>
            <a href={link(`/e/${id}`)}>
              <span className="display-link-full">
                {location.host}
                {link(`/e/${id}`)}
              </span>
              <span className="display-link-short">Join tasting</span>
            </a>
          </div>
          <RoundClock event={data} />
          <TableDisplay event={data} />
        </main>
      )}
    </div>
  );
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="narrow join">
      <div className="eyebrow">BEHIND THE BAR</div>
      <h1>Host’s table.</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/host/login", "POST", { password });
            onLogin();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="password">Host password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <ErrorBox message={error} />}
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Open host controls"}
        </button>
      </form>
    </main>
  );
}
function Host() {
  const [events, setEvents] = useState<PublicEvent[]>([]),
    [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const load = useCallback(async () => {
    try {
      setEvents(await api("/host/events"));
      setAuthenticated(true);
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAuthenticated(false);
      else setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const id = location.pathname
    .replace(base, "")
    .match(/^\/host\/e\/([a-f0-9]{32})$/)?.[1];
  return (
    <>
      <Header mode="Host controls" />
      {error && (
        <div className="narrow">
          <ErrorBox message={error} />
        </div>
      )}
      {authenticated === false ? (
        <Login onLogin={() => void load()} />
      ) : authenticated === null ? (
        <main className="narrow">Checking host access…</main>
      ) : id ? (
        <HostEvent id={id} />
      ) : (
        <main className="host-home narrow">
          <div className="eyebrow">BEHIND THE BAR</div>
          <h1>
            Set the <em>table.</em>
          </h1>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (creatingRef.current) return;
              creatingRef.current = true;
              setCreating(true);
              setError("");
              try {
                const event = await api<PublicEvent>("/host/events", "POST", {
                  name,
                });
                location.href = link(`/host/e/${event.id}`);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                creatingRef.current = false;
                setCreating(false);
              }
            }}
          >
            <label htmlFor="event-name">Name your evening</label>
            <input
              id="event-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              placeholder="Friday at Harold’s"
            />
            <button className="primary" disabled={creating}>
              {creating ? "Creating event…" : "Create event"}
            </button>
          </form>
          <h2>Your tastings</h2>
          {events.length === 0 ? (
            <p className="muted">Your first evening starts here.</p>
          ) : (
            events.map((e) => (
              <a
                className="event-link"
                key={e.id}
                href={link(`/host/e/${e.id}`)}
              >
                <strong>{e.name}</strong>
                <span>
                  {e.phase} · {e.participants} guests
                </span>
              </a>
            ))
          )}
        </main>
      )}
    </>
  );
}
function WineListEditor({
  event,
  disabled,
  onSave,
}: {
  event: PublicEvent;
  disabled: boolean;
  onSave: (wines: EventWine[]) => Promise<void>;
}) {
  const [wines, setWines] = useState<EventWine[]>(event.wines || []);
  const savedWines = JSON.stringify(event.wines || []);
  useEffect(() => setWines(JSON.parse(savedWines)), [savedWines]);
  const valid =
    wines.length === 8 &&
    wines.every(
      (w) =>
        w.type.trim() &&
        w.type.trim().length <= 80 &&
        w.producer.trim() &&
        w.producer.trim().length <= 120,
    ) &&
    new Set(wines.map((w) => w.type.trim().toLocaleLowerCase())).size === 8;
  const changed = JSON.stringify(wines) !== JSON.stringify(event.wines);
  return (
    <details className="wine-list-editor">
      <summary>Edit event wines</summary>
      <p className="small muted">
        Customize the eight answer choices. Replace any wine with your own wine
        type and producer. This list is not the pouring order; assign rounds
        below. Wine-type labels are public answer choices; keep exact bottle
        names and producers in the Producer field. Guests only see wine types
        until reveal.
      </p>
      {wines.map((wine, i) => (
        <div className="key-grid wine-edit-row" key={i}>
          <label>
            Wine type {i + 1}
            <input
              disabled={disabled}
              maxLength={80}
              value={wine.type}
              onChange={(e) =>
                setWines((p) =>
                  p.map((w, j) =>
                    j === i ? { ...w, type: e.target.value } : w,
                  ),
                )
              }
            />
          </label>
          <label>
            Producer {i + 1}
            <input
              disabled={disabled}
              maxLength={120}
              value={wine.producer}
              onChange={(e) =>
                setWines((p) =>
                  p.map((w, j) =>
                    j === i ? { ...w, producer: e.target.value } : w,
                  ),
                )
              }
            />
          </label>
        </div>
      ))}
      <p className="small" role="status">
        {!valid
          ? "Enter eight different wine types and a producer for each."
          : changed
            ? "Save your wine list before assigning the pouring order. Changing a wine type may clear the saved answer key."
            : "Wine list saved."}
      </p>
      <button
        type="button"
        disabled={disabled || !valid || !changed}
        onClick={() => {
          if (
            event.key?.length &&
            wines.some((w, i) => w.type.trim() !== event.wines?.[i]?.type) &&
            !confirm(
              "Changing wine types may clear the answer key. Save this wine list?",
            )
          )
            return;
          void onSave(wines);
        }}
      >
        Save wine list
      </button>
    </details>
  );
}
function HostGuestSheet({
  guest,
  event,
  disconnected,
  onClose,
  control,
  disabled,
}: {
  control: HostControl;
  disabled: boolean;
  guest: HostParticipant;
  event: PublicEvent;
  disconnected: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="guest-sheet"
      aria-labelledby="guest-sheet-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="sheet-heading">
        <div>
          <Avatar person={guest} />
          <h2 id="guest-sheet-title">{guest.name}’s scorecard</h2>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="small muted">
        Host-only, read-only view. Updates automatically with confirmed saves;
        unsaved device edits do not appear here.
      </p>
      {disconnected && (
        <p className="warning" role="status">
          Connection interrupted. Showing the last received scorecard.
        </p>
      )}
      <p role="status">
        {guest.submitted && guest.valid
          ? "Submitted"
          : guest.valid
            ? "Complete · awaiting final submission"
            : "Draft · incomplete or repeated guesses"}{" "}
        · {guest.correctCount} / 8 correct guesses
      </p>
      {!!guest.missing.length && (
        <p className="small">
          Missing guess or valid rating: rounds {guest.missing.join(", ")}.
        </p>
      )}
      {guest.duplicates.map((rounds) => (
        <p className="warning small" key={rounds.join("-")}>
          Repeated wine type in rounds {rounds.join(" & ")}.
        </p>
      ))}
      <a
        className="button"
        href={link(`/host/assist/e/${event.id}?guest=${guest.id}`)}
      >
        Enter answers for {guest.name} · spoiler-minimized page
      </a>
      <PinReset
        name={guest.name}
        participantId={guest.id}
        disabled={disabled}
        control={control}
      />
      {Array.from({ length: 8 }, (_, i) => i + 1).map((round) => {
        const entry = guest.entries[round];
        const unlocked = round <= event.unlocked;
        const correct =
          !!entry?.guess &&
          event.choices.includes(entry.guess) &&
          !guest.duplicates.some((rs) => rs.includes(round)) &&
          entry.guess === event.key?.[round - 1];
        return (
          <section key={round} className="sheet-round">
            <h3>
              Round {round}
              {round === event.unlocked && event.phase === "tasting"
                ? " · Current round"
                : ""}
            </h3>
            {!unlocked ? (
              <p className="muted">Not unlocked yet.</p>
            ) : !entry ? (
              <p className="muted">No entry yet.</p>
            ) : (
              <>
                <div className="sheet-values">
                  <p>
                    <span className="muted">Wine-type guess</span>
                    <strong>{entry.guess || "No guess"}</strong>
                    {entry.guess && (
                      <small>
                        {correct ? "Correct ✓" : "No point for this guess"}
                      </small>
                    )}
                  </p>
                  <p>
                    <span className="muted">Rating</span>
                    <strong>
                      {validRating(entry.rating)
                        ? `${entry.rating.toFixed(1)} / 10`
                        : "No rating"}
                    </strong>
                  </p>
                </div>
                <p className="small muted">Private tasting notes</p>
                <p className="private-note">{entry.notes || "No notes."}</p>
              </>
            )}
          </section>
        );
      })}
    </dialog>
  );
}
function HostEvent({ id }: { id: string }) {
  const { data, error, accept, refresh, authExpired } = useEvent(id, true);
  const guestTrigger = useRef<HTMLButtonElement | null>(null);
  const [key, setKey] = useState<string[]>(Array(8).fill("")),
    [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false),
    [theatrical, setTheatrical] = useState(false),
    [override, setOverride] = useState(false),
    [reset, setReset] = useState(false),
    [confirm, setConfirm] = useState(""),
    [selectedGuest, setSelectedGuest] = useState<string | null>(null);
  useEffect(() => {
    setKey(data?.key?.length === 8 ? data.key : Array(8).fill(""));
  }, [data?.key?.join("|")]);
  const control = async (
    action: string,
    extras: Record<string, unknown> = {},
  ) => {
    if (!data) return false;
    if (busy || error) return false;
    setBusy(true);
    setActionError("");
    try {
      const next = await api<PublicEvent>(`/events/${id}/control`, "POST", {
        action,
        revision: data.controlRevision,
        ...extras,
      });
      accept(next);
      if (action === "wines")
        setKey(next.key?.length === 8 ? next.key : Array(8).fill(""));
      if (action === "reset") {
        setKey(Array(8).fill(""));
        setReset(false);
        setConfirm("");
      }
      return true;
    } catch (e) {
      setActionError((e as Error).message);
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (authExpired)
    return (
      <>
        <main className="narrow">
          <h1>Sign in again</h1>
          <p>
            Your host session expired. Your event, rounds and results are saved.
            Sign in to continue where you left off.
          </p>
        </main>
        <Login onLogin={() => void refresh()} />
      </>
    );
  if (!data)
    return (
      <main className="narrow">
        {error ? <ErrorBox message={error} /> : "Loading host table…"}
      </main>
    );
  const affected = data.roster?.filter((p) => !p.submitted || !p.valid) || [];
  const guestSheet = data.roster?.find((p) => p.id === selectedGuest);
  return (
    <main className="host-main">
      {guestSheet && (
        <HostGuestSheet
          key={guestSheet.id}
          guest={guestSheet}
          event={data}
          disconnected={!!error}
          disabled={busy || !!error}
          control={control}
          onClose={() => {
            setSelectedGuest(null);
            requestAnimationFrame(() => guestTrigger.current?.focus());
          }}
        />
      )}
      <div className="host-heading">
        <div>
          <a className="quiet" href={link("/host")}>
            All tastings
          </a>
          <h1>{data.name}</h1>
          <span className="eyebrow">
            {data.phase === "tasting"
              ? `ROUND ${data.unlocked} OF 8`
              : data.phase.toUpperCase()}
          </span>
        </div>
        <div className="host-links">
          <a
            className="button"
            target="_blank"
            rel="noreferrer"
            href={link(`/projector/e/${id}`)}
          >
            Open big-screen display
          </a>
          <a
            className="button"
            target="_blank"
            rel="noreferrer"
            href={link(`/e/${id}`)}
          >
            Guest link
          </a>
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(`${location.origin}${link(`/e/${id}`)}`)
                .catch(() =>
                  setActionError(
                    "Copy the Guest link from its browser address.",
                  ),
                )
            }
          >
            Copy invitation
          </button>
        </div>
      </div>
      {(error || actionError) && <ErrorBox message={actionError || error} />}
      <div className="host-grid">
        <section className="panel">
          <div className="eyebrow">RUN THE EVENING</div>
          {busy && (
            <p role="status" className="small">
              Updating event…
            </p>
          )}
          {error && (
            <p className="warning">
              Connection interrupted. Showing the last received state; host
              actions pause until reconnection.
            </p>
          )}
          <h2>
            {data.phase === "setup"
              ? "The private pouring order"
              : data.phase === "tasting"
                ? "Keep the glasses moving"
                : data.phase === "summary"
                  ? "A toast to the results"
                  : `Reveal round ${data.presenting}`}
          </h2>
          {data.phase === "setup" ? (
            <>
              <BottlePhotos
                event={data}
                disabled={busy || !!error}
                onSaved={accept}
              />
              <WineListEditor
                event={data}
                disabled={busy || !!error}
                onSave={async (wines) => {
                  await control("wines", { wines });
                }}
              />
              <p className="muted">
                Assign each wine type once. This is your actual pouring order.
                Only the host can see it.
              </p>
              <p className="small muted">
                Guests can try a private practice round on their phones while
                waiting. Start round 1 to end practice; practice answers never
                count toward results.
              </p>
              <div className="key-grid">
                {Array.from({ length: 8 }, (_, i) => (
                  <label key={i}>
                    Round {i + 1}
                    <select
                      aria-label={`Answer for round ${i + 1}`}
                      disabled={busy || !!error}
                      value={key[i]}
                      onChange={(e) =>
                        setKey((p) =>
                          p.map((v, j) => (i === j ? e.target.value : v)),
                        )
                      }
                    >
                      <option value="">Assign wine type</option>
                      {data.choices.map((w) => (
                        <option key={w}>{w}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p id="key-help" className="small muted" role="status">
                {key.some((w) => !w)
                  ? `Assign ${key.filter((w) => !w).length} remaining rounds, using each wine once.`
                  : new Set(key).size !== 8
                    ? "Repeated wine types in the key. Assign each wine once before saving."
                    : JSON.stringify(key) !== JSON.stringify(data.key)
                      ? "Save this key to enable Start round 1."
                      : "Answer key saved. Start when your guests are ready."}
              </p>
              <div className="actions">
                <button
                  disabled={
                    busy ||
                    !!error ||
                    new Set(key).size !== 8 ||
                    key.some((v) => !v)
                  }
                  onClick={() => void control("key", { key })}
                >
                  Save answer key
                </button>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !!error ||
                    data.key?.length !== 8 ||
                    JSON.stringify(key) !== JSON.stringify(data.key)
                  }
                  onClick={() => void control("start")}
                >
                  Start round 1
                </button>
              </div>
            </>
          ) : data.phase === "tasting" ? (
            <>
              <div className="large-round">
                {String(data.unlocked).padStart(2, "0")}
                <span> / 08</span>
              </div>
              <p className="muted">
                Guests can edit every open round. Future rounds stay hidden.
              </p>
              {data.phase === "tasting" && (
                <section
                  className="host-readiness"
                  aria-label="Current round readiness"
                >
                  <h3>
                    {data.tableGuests.filter((p) => p.ready).length} of{" "}
                    {data.participants} ready for round {data.unlocked}
                  </h3>
                  <p className="small muted">
                    Ready means a valid guess and rating are confirmed saved.
                    Guests can still edit until locking.
                  </p>
                  <p role="status">
                    {error
                      ? "Connection interrupted · last received readiness"
                      : data.tableGuests.some((p) => !p.ready)
                        ? `Waiting: ${data.tableGuests
                            .filter((p) => !p.ready)
                            .map((p) => p.name)
                            .join(", ")}`
                        : data.participants
                          ? "Everyone is ready for this round."
                          : "No guests have joined yet."}
                  </p>
                </section>
              )}
              <RoundClock event={data} />
              <TimerControls
                event={data}
                disabled={busy || !!error}
                control={control}
              />
              {data.unlocked < 8 ? (
                <button
                  className="primary"
                  disabled={busy || !!error}
                  onClick={() => void control("unlock")}
                >
                  Open round {data.unlocked + 1}
                </button>
              ) : (
                <>
                  <h3>Before locking</h3>
                  {affected.length ? (
                    <div className="warning">
                      {affected.map((p) => (
                        <p key={p.id}>
                          <strong>{p.name}</strong>:{" "}
                          {!p.valid
                            ? `${p.missing.length ? `missing/invalid rounds ${p.missing.join(", ")}; ` : ""}${p.duplicates.length ? `repeated guesses in ${p.duplicates.map((r) => r.join(" & ")).join("; ")}` : ""}`
                            : "not finally submitted"}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p>Every guest has submitted a valid scorecard.</p>
                  )}
                  {affected.length > 0 && (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={override}
                        onChange={(e) => setOverride(e.target.checked)}
                      />
                      Lock anyway. Editing ends immediately, including on other
                      phones. Incomplete cards are marked; invalid guesses and
                      unsubmitted ratings are excluded.
                    </label>
                  )}
                  <button
                    className="primary"
                    disabled={
                      busy || !!error || (affected.length > 0 && !override)
                    }
                    onClick={() => void control("lock", { override })}
                  >
                    Lock submissions & open results
                  </button>
                </>
              )}
            </>
          ) : data.phase === "locked" ? (
            <>
              <p className="muted">
                {data.presenting > data.revealed
                  ? "Guests can see the guesses. Make your reveal."
                  : "Wine revealed. Give the room a moment."}
              </p>
              {data.revealCountdown ? (
                <p role="status">Reveal countdown running…</p>
              ) : data.presenting > data.revealed ? (
                <>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={theatrical}
                      onChange={(e) => setTheatrical(e.target.checked)}
                    />
                    Three-second reveal countdown
                  </label>
                  <button
                    className="primary"
                    disabled={busy || !!error}
                    onClick={() =>
                      void control("reveal", {
                        countdown: theatrical,
                        staged: true,
                      })
                    }
                  >
                    Reveal wine {data.presenting}
                  </button>
                </>
              ) : data.revealed < 8 ? (
                <button
                  className="primary"
                  disabled={busy || !!error}
                  onClick={() => void control("next")}
                >
                  Show round {data.presenting + 1} guesses
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={busy || !!error}
                  onClick={() => void control("summary")}
                >
                  Open final summary
                </button>
              )}
            </>
          ) : (
            <p>Results are saved. The event link stays open for revisits.</p>
          )}
          {(data.phase === "locked" || data.phase === "summary") && (
            <a className="button" href={link(`/api/events/${id}/export`)}>
              Download CSV
            </a>
          )}
          {(data.phase === "tasting" || data.phase === "locked") &&
            data.revealed === 0 && (
              <PouringCorrection
                event={data}
                disabled={busy || !!error}
                control={control}
              />
            )}
          <CorrectionHistory event={data} />
          {data.phase !== "setup" && data.revealed === 0 && (
            <details
              open={reset}
              onToggle={(e) => setReset(e.currentTarget.open)}
              className="reset"
            >
              <summary>Reset this tasting</summary>
              <p className="warning">
                This clears all scorecards and the answer key. Guest seats are
                kept. This cannot be undone.
              </p>
              <label htmlFor="reset-confirm">
                Type “{data.name}” to confirm
              </label>
              <input
                id="reset-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <button
                disabled={busy || !!error || confirm !== data.name}
                onClick={() => void control("reset", { confirm })}
              >
                Clear & return to setup
              </button>
            </details>
          )}
        </section>
        <section className="panel">
          <div className="eyebrow">AT THE TABLE</div>
          <div className="host-counts">
            <strong>
              {data.participants}
              <small> guests</small>
            </strong>
            <strong>
              {data.completed}
              <small> submitted</small>
            </strong>
          </div>
          {data.roster?.length ? (
            <div className="roster">
              {data.roster.map((p) => (
                <div key={p.id}>
                  <button
                    type="button"
                    className="open-guest-sheet"
                    aria-label={`View ${p.name}’s scorecard`}
                    onClick={(e) => {
                      guestTrigger.current = e.currentTarget;
                      setSelectedGuest(p.id);
                    }}
                  >
                    <Avatar person={p} />
                    <span>
                      {p.name}
                      <small>View scorecard</small>
                    </span>
                  </button>
                  <span className={p.submitted && p.valid ? "good" : "muted"}>
                    {p.submitted && p.valid
                      ? "Submitted ✓"
                      : p.valid
                        ? "Ready to submit"
                        : "Draft"}
                  </span>
                  <a
                    className="button assist-guest"
                    aria-label={`Enter answers for ${p.name}`}
                    href={link(`/host/assist/e/${id}?guest=${p.id}`)}
                  >
                    Assist
                  </a>
                  <button
                    type="button"
                    className="remove-guest"
                    disabled={busy || !!error}
                    aria-label={`Remove ${p.name}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${p.name} from this tasting? Their seat, scorecard and recovery PIN will be deleted. Counts and results will update. This cannot be undone.`,
                        )
                      )
                        void control("remove", {
                          participantId: p.id,
                          confirm: p.name,
                        });
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              Share the invitation or put the QR code on the projector.
            </p>
          )}
          <SeatingEditor
            event={data}
            disabled={busy || !!error}
            onSave={async (seating) => {
              await control("seating", { seating });
            }}
          />
          <img
            className="host-qr"
            src={link(`/api/events/${id}/qr`)}
            alt="Guest join QR code"
          />
          <p className="small muted">
            Phones and the optional display update automatically. Notes stay
            private.
          </p>
        </section>
      </div>
      {(data.phase === "locked" || data.phase === "summary") && (
        <Results event={data} />
      )}
    </main>
  );
}
function App() {
  let path = location.pathname.slice(base.length);
  const assistedId = path.match(/^\/host\/assist\/e\/([a-f0-9]{32})\/?$/)?.[1];
  if (assistedId)
    return (
      <>
        <Header mode="Assisted entry" />
        <AssistedEntry id={assistedId} />
      </>
    );
  if (path.startsWith("/host")) return <Host />;
  let id = path.match(/^\/projector\/e\/([a-f0-9]{32})\/?$/)?.[1];
  if (id) return <Projector id={id} />;
  id = path.match(/^\/e\/([a-f0-9]{32})\/?$/)?.[1];
  return id ? <Guest id={id} /> : <Home />;
}
class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <>
        <Header />
        <main className="narrow">
          <ErrorBox
            message={`Unable to open the scorecard: ${this.state.error}`}
          />
          <p>
            Allow browser storage for this site, then reload. Use a regular
            browser tab for refresh recovery.
          </p>
          <button onClick={() => location.reload()}>Reload</button>
        </main>
      </>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <App />
  </Boundary>,
);
