import { useEffect, useState } from "react";
import { api } from "./api";
import type { PublicEvent } from "./shared";
import { tasteInsights } from "./taste-insights";

export function RevealCountdown({ event }: { event: PublicEvent }) {
  const [now, setNow] = useState(Date.now());
  const offset = (event.serverTime ?? Date.now()) - Date.now();
  useEffect(() => {
    const tick = () => setNow(Date.now() + offset);
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [event.revealCountdown?.endsAt, event.serverTime]);
  if (!event.revealCountdown) return null;
  const seconds = Math.max(
    0,
    Math.ceil((event.revealCountdown.endsAt - now) / 1000),
  );
  return (
    <section
      className="reveal-countdown"
      aria-label={`Round ${event.revealCountdown.round} reveal countdown`}
    >
      <p className="eyebrow">
        THE MOMENT OF TRUTH · ROUND {event.revealCountdown.round}
      </p>
      <strong key={seconds} aria-hidden="true">
        {seconds || "…"}
      </strong>
      <p role="status">
        {seconds
          ? `Revealing in ${seconds}…`
          : "Waiting for the confirmed reveal…"}
      </p>
    </section>
  );
}

export function BottlePhotos({
  event,
  disabled,
  onSaved,
}: {
  event: PublicEvent;
  disabled: boolean;
  onSaved: (event: PublicEvent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(wine: string, photo: string) {
    onSaved(
      await api<PublicEvent>(`/events/${event.id}/bottle`, "PUT", {
        wine,
        photo,
        revision: event.controlRevision,
      }),
    );
  }
  return (
    <details className="bottle-editor">
      <summary>Add bottle photos (optional)</summary>
      <p className="small muted">
        Attach photos to wine types, then assign the pouring order below. Photos
        stay private until their wine is revealed. Save wine-list edits before
        uploading. Photos freeze when tasting starts.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {event.choices.map((wine) => (
        <div className="bottle-upload-row" key={wine}>
          {event.bottlePhotos?.[wine] && (
            <img
              src={event.bottlePhotos[wine]}
              alt={`${wine} bottle preview`}
            />
          )}
          <label>
            {wine} bottle photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              disabled={disabled || busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(true);
                setError("");
                const url = URL.createObjectURL(file);
                try {
                  if (file.size > 20 * 1024 * 1024)
                    throw new Error("Choose a photo smaller than 20 MB.");
                  const image = new Image();
                  image.src = url;
                  await image.decode();
                  const ratio = Math.min(
                    1,
                    512 / Math.max(image.naturalWidth, image.naturalHeight),
                  );
                  const canvas = document.createElement("canvas");
                  canvas.width = Math.max(
                    1,
                    Math.round(image.naturalWidth * ratio),
                  );
                  canvas.height = Math.max(
                    1,
                    Math.round(image.naturalHeight * ratio),
                  );
                  const ctx = canvas.getContext("2d");
                  if (!ctx) throw new Error("Photo processing is unavailable.");
                  ctx.fillStyle = "white";
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                  await save(wine, canvas.toDataURL("image/jpeg", 0.65));
                } catch (err) {
                  setError(
                    `${(err as Error).message} Try again; if the file cannot open, use JPEG, PNG or WebP.`,
                  );
                } finally {
                  URL.revokeObjectURL(url);
                  setBusy(false);
                }
              }}
            />
          </label>
          {event.bottlePhotos?.[wine] && (
            <button
              disabled={disabled || busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await save(wine, "");
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove photo
            </button>
          )}
        </div>
      ))}
      <p className="small" role="status">
        {busy
          ? "Preparing and saving photo…"
          : "Uploaded previews are confirmed saved."}
      </p>
    </details>
  );
}

export function TasteInsights({ event }: { event: PublicEvent }) {
  const insights = tasteInsights(event);
  if (!insights) return null;
  return (
    <section className="panel taste-insights">
      <div className="eyebrow">YOUR PALATE · PRIVATE</div>
      <h2>Your taste, by the glass</h2>
      {!insights.rows.length ? (
        <p>No saved ratings to compare this evening.</p>
      ) : (
        <>
          <p>
            Your favorites:{" "}
            <strong>{insights.favorites.map((w) => w.wine).join(", ")}</strong>{" "}
            · {insights.high!.toFixed(1)} / 10
          </p>
          <p>
            Rating range:{" "}
            <strong>
              {insights.low!.toFixed(1)}–{insights.high!.toFixed(1)}
            </strong>{" "}
            across {insights.rows.length} saved ratings.
          </p>
          <p className="small muted">
            Compared with the group’s valid submitted ratings
            {insights.included
              ? ", including yours."
              : ". Your draft ratings did not contribute to group averages."}{" "}
            This reflects this evening’s wines.
          </p>
          {insights.rows.map((w) => (
            <div className="wine-row" key={w.round}>
              <div>
                <strong>{w.wine}</strong>
                <small>
                  Round {w.round} · You {w.rating.toFixed(1)} · Group{" "}
                  {w.average?.toFixed(1) ?? "—"} ({w.count} ratings)
                </small>
              </div>
              <span className="small">
                {w.difference === null
                  ? "No group comparison"
                  : Math.abs(w.difference) < 0.05
                    ? "Close to the group"
                    : `${Math.abs(w.difference).toFixed(1)} ${w.difference > 0 ? "above" : "below"} group`}
              </span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

export function EveningRecap({ event }: { event: PublicEvent }) {
  const [leaderboard, setLeaderboard] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!event.summary) return null;
  async function create() {
    setBusy(true);
    setError("");
    setPreview("");
    try {
      await document.fonts.ready;
      const { renderRecap } = await import("./recap");
      setPreview(renderRecap(event, leaderboard));
    } catch {
      setError(
        "The image could not be created. Please try again in this browser.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel evening-recap">
      <h2>Take the evening home</h2>
      <p>
        Make a shareable PNG with the event name, all eight wines and the
        group’s favorites.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={leaderboard}
          onChange={(e) => {
            setLeaderboard(e.target.checked);
            setPreview("");
          }}
        />
        Include leaderboard and guest names
      </label>
      <p className="small muted">
        Private notes and personal taste insights are always excluded. Review
        the preview before sharing.
      </p>
      <button disabled={busy} onClick={() => void create()}>
        {busy ? "Creating image…" : "Preview evening recap"}
      </button>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <>
          <img
            className="recap-preview"
            src={preview}
            alt={`Evening recap for ${event.name}${leaderboard ? ", including leaderboard" : ", without guest names"}`}
          />
          <a
            className="button primary"
            href={preview}
            download="blind-tasting-evening-recap.png"
          >
            Download recap PNG
          </a>
        </>
      )}
    </section>
  );
}
