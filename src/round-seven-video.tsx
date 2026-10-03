import { useState } from "react";
import type { PublicEvent } from "./shared";
import { readLocal, writeLocal } from "./storage";

// One evening's public interlude; never alters the authoritative tasting state.
export function RoundSevenVideo({ event }: { event: PublicEvent }) {
  const storageKey = `tasting.round-seven-video.${event.id}.${event.generation}`;
  const [dismissed, setDismissed] = useState(
    () => readLocal(storageKey) === "1",
  );
  const [playing, setPlaying] = useState(false);
  if (
    event.id !== "9948166e7b4d09f6f628b4189dca38ca" ||
    event.phase !== "tasting" ||
    event.unlocked !== 7
  )
    return null;
  if (dismissed)
    return (
      <button
        className="round-video-replay"
        onClick={() => {
          setDismissed(false);
          setPlaying(false);
        }}
      >
        Play Round 7 video
      </button>
    );
  return (
    <section className="round-video-overlay" aria-label="Round 7 video">
      <div className="round-video-panel">
        <h2>Round 7</h2>
        <div className="round-video-player">
          {playing ? (
            <iframe
              title="Dre Tasting · Round 7 video"
              src="https://www.youtube-nocookie.com/embed/xq08At8bVOA?autoplay=1&rel=0&playsinline=1"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button className="primary" onClick={() => setPlaying(true)}>
              Play video ▶
            </button>
          )}
        </div>
        <div className="actions">
          <button
            className="primary"
            onClick={() => {
              writeLocal(storageKey, "1");
              setDismissed(true);
              setPlaying(false);
            }}
          >
            Return to tasting table
          </button>
          {playing && (
            <a
              href="https://www.youtube.com/watch?v=xq08At8bVOA"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open on YouTube ↗
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
