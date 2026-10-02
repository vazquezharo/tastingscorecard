import walnutTabletop from "./assets/walnut-tabletop.png";
import { useEffect, useState } from "react";
import { readLocal, writeLocal } from "./storage";
import { Avatar } from "./avatar";
import type { PublicEvent, Seating } from "./shared";

export function SeatingEditor({
  event,
  disabled,
  onSave,
}: {
  event: PublicEvent;
  disabled: boolean;
  onSave: (seating: Seating) => Promise<void>;
}) {
  const saved = JSON.stringify(
    event.seating ?? { shape: "round", seats: Array(12).fill(null) },
  );
  const [draft, setDraft] = useState<Seating>(() => JSON.parse(saved));
  useEffect(() => {
    setDraft(JSON.parse(saved));
  }, [saved]);
  const changed = JSON.stringify(draft) !== saved;
  return (
    <details className="seating-editor">
      <summary>Arrange table</summary>
      <p className="muted">
        Place guests where they sit. The big-screen display shows who has saved
        a guess and rating for the current round. Answers stay private.
      </p>
      <fieldset disabled={disabled}>
        <div className="seating-controls">
          <label>
            Table shape
            <select
              value={draft.shape}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  shape: e.target.value as Seating["shape"],
                })
              }
            >
              <option value="round">Round</option>
              <option value="square">Square</option>
              <option value="rectangle">Rectangle</option>
            </select>
          </label>
          <label>
            Number of seats
            <select
              value={draft.seats.length}
              onChange={(e) => {
                const count = Number(e.target.value);
                if (
                  count < draft.seats.length &&
                  draft.seats.slice(count).some(Boolean) &&
                  !window.confirm(
                    "Reducing seats will unseat guests in the removed seats. Their scorecards remain saved. Continue?",
                  )
                )
                  return;
                setDraft({
                  ...draft,
                  seats: Array.from(
                    { length: count },
                    (_, i) => draft.seats[i] ?? null,
                  ),
                });
              }}
            >
              {Array.from({ length: 19 }, (_, i) => (
                <option key={i} value={i + 2}>
                  {i + 2}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!event.tableGuests.length && (
          <p className="muted">Guests will appear here after joining.</p>
        )}
        <p className="small muted">
          {draft.shape === "rectangle"
            ? "Seats run along the two long sides only: the top from left to right, then the bottom from right to left. Eight seats means four on each side, with nobody at the heads."
            : "Seats run clockwise from the top of the table."}
        </p>
        <div className="seat-assignments">
          {draft.seats.map((id, i) => (
            <label key={i}>
              Seat {i + 1}
              <select
                aria-label={`Seat ${i + 1}`}
                value={id ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    seats: draft.seats.map((s, j) =>
                      i === j ? e.target.value || null : s,
                    ),
                  })
                }
              >
                <option value="">Empty seat</option>
                {event.tableGuests.map((g) => (
                  <option
                    key={g.id}
                    value={g.id}
                    disabled={g.id !== id && draft.seats.includes(g.id)}
                  >
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => void onSave(draft)}
        >
          Save seating
        </button>
      </fieldset>
      <p className="small" role="status">
        {disabled
          ? "Waiting for connection or host action…"
          : changed
            ? "Seating changes not saved yet."
            : event.seating
              ? "Seating saved."
              : "Choose seats and save to show the table on the display."}
      </p>
    </details>
  );
}

function position(index: number, count: number, shape: Seating["shape"]) {
  if (shape === "round") {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return {
      left: `${50 + 42 * Math.cos(angle)}%`,
      top: `${50 + 40 * Math.sin(angle)}%`,
    };
  }
  if (shape === "rectangle") {
    const topCount = Math.ceil(count / 2);
    const isTop = index < topCount;
    const sideCount = isTop ? topCount : count - topCount;
    const sideIndex = isTop ? index : index - topCount;
    const along = (sideIndex + 0.5) / sideCount;
    return {
      left: `${20 + (isTop ? along : 1 - along) * 60}%`,
      top: isTop ? "10%" : "90%",
    };
  }
  // Square tables keep clockwise perimeter seating.
  const width = 1;
  const perimeter = 2 * (width + 1);
  let distance = ((index / count) * perimeter + width / 2) % perimeter;
  let x: number, y: number;
  if (distance < width) {
    x = distance / width;
    y = 0;
  } else if ((distance -= width) < 1) {
    x = 1;
    y = distance;
  } else if ((distance -= 1) < width) {
    x = 1 - distance / width;
    y = 1;
  } else {
    distance -= width;
    x = 0;
    y = 1 - distance;
  }
  return { left: `${8 + x * 84}%`, top: `${10 + y * 80}%` };
}

export function TableDisplay({
  event,
  readOnly = false,
}: {
  event: PublicEvent;
  readOnly?: boolean;
}) {
  const [layout, setLayout] = useState(() => {
    const saved = readLocal("tasting.display-layout.v1");
    return saved === "table" || saved === "compact" ? saved : "auto";
  });
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  useEffect(() => {
    const resize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const compact =
    event.seating?.shape === "rectangle" ||
    (!readOnly && layout === "compact") ||
    ((readOnly || layout === "auto") &&
      ((event.seating?.seats.length ?? 0) > 12 ||
        viewport.width < 1300 ||
        viewport.height < 1200 ||
        !!event.roundTimer));
  const guests = event.tableGuests;
  const ready = guests.filter((g) => g.ready).length;
  const assigned = new Set(event.seating?.seats.filter(Boolean));
  const unseated = guests.filter((g) => !assigned.has(g.id));
  const status = (g: (typeof guests)[number]) =>
    event.phase === "setup" ? "Joined" : g.ready ? "Ready ✓" : "Waiting";
  const savedSeats = (event.seating?.seats || []).map((id, index) => ({
    id,
    index,
  }));
  const hasAssignedGuests = savedSeats.some((seat) =>
    guests.some((g) => g.id === seat.id),
  );
  const halfway = Math.ceil(savedSeats.length / 2);
  // Collapse empty spaces only in the public rectangle; keep seat numbers and physical sides.
  const visibleSide = (seats: typeof savedSeats) =>
    seats.filter(
      (seat) => !hasAssignedGuests || guests.some((g) => g.id === seat.id),
    );
  const topSeats = visibleSide(savedSeats.slice(0, halfway));
  const bottomSeats = visibleSide(savedSeats.slice(halfway));
  const renderSeat = ({ id, index }: (typeof savedSeats)[number]) => {
    const guest = guests.find((g) => g.id === id);
    return (
      <div
        key={index}
        className={`table-seat ${guest?.ready && event.phase !== "setup" ? "is-ready" : ""}`}
        style={
          compact
            ? undefined
            : position(index, savedSeats.length, event.seating!.shape)
        }
      >
        <small>Seat {index + 1}</small>
        {guest ? (
          <>
            <Avatar person={guest} />
            <strong title={guest.name}>{guest.name}</strong>
            <span>{status(guest)}</span>
          </>
        ) : (
          <span className="empty-seat">Empty seat</span>
        )}
      </div>
    );
  };
  return (
    <section className="table-display" aria-label="Current round readiness">
      <h2>
        {event.phase === "setup"
          ? readOnly
            ? `${guests.length} guests joined`
            : "Find your seat"
          : `${ready} / ${guests.length} ready for round ${event.unlocked}`}
      </h2>
      <p className="muted">
        {event.phase === "setup"
          ? "Open the tasting link from the group chat; QR is optional."
          : "Ready = guess and rating saved. You can still edit until the host locks submissions."}
      </p>
      {event.seating && !readOnly && (
        <label className="display-layout-control">
          Display layout
          <select
            value={layout}
            onChange={(e) => {
              setLayout(e.target.value);
              writeLocal("tasting.display-layout.v1", e.target.value);
            }}
          >
            <option value="auto">Automatic</option>
            <option value="table">Table map</option>
            <option value="compact">Compact seats</option>
          </select>
        </label>
      )}
      {event.seating && (
        <div className="table-scroll">
          <div
            className={`table-map table-${event.seating.shape} ${event.seating.seats.length > 14 ? "many-seats" : ""} ${compact ? "compact-seats" : ""}`}
          >
            {event.seating.shape === "rectangle" && (
              <div
                className="table-side table-side-top"
                style={
                  {
                    "--side-seats": Math.max(1, topSeats.length),
                  } as React.CSSProperties
                }
              >
                {topSeats.map(renderSeat)}
              </div>
            )}
            <div
              className="table-surface"
              style={
                event.seating.shape === "rectangle"
                  ? { backgroundImage: `url(${walnutTabletop})` }
                  : undefined
              }
            >
              <span>
                {event.phase === "setup"
                  ? "The tasting table"
                  : `Round ${event.unlocked}`}
              </span>
              {compact && (
                <small>
                  {event.seating.shape === "round"
                    ? "Round"
                    : event.seating.shape === "square"
                      ? "Square"
                      : "Rectangular"}{" "}
                  table ·{" "}
                  {event.seating.shape === "rectangle"
                    ? "seats on long sides only"
                    : "numbered clockwise from the top"}
                </small>
              )}
            </div>
            {event.seating.shape === "rectangle" ? (
              <div
                className="table-side table-side-bottom"
                style={
                  {
                    "--side-seats": Math.max(1, bottomSeats.length),
                  } as React.CSSProperties
                }
              >
                {bottomSeats.map(renderSeat)}
              </div>
            ) : (
              savedSeats.map(renderSeat)
            )}
          </div>
        </div>
      )}
      {unseated.length > 0 && (
        <div className="unseated-guests">
          <h3>
            {event.seating
              ? "Guests without a seat assignment"
              : "At the table"}
          </h3>
          <ul>
            {unseated.map((g) => (
              <li key={g.id} className={g.ready ? "is-ready" : ""}>
                <Avatar person={g} />
                <strong>{g.name}</strong>
                <span>{status(g)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!guests.length && (
        <p>No guests yet. Share the invitation to fill the table.</p>
      )}
    </section>
  );
}
