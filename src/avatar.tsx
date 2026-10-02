import { useId, useRef, useState, type PointerEvent } from "react";
import { avatarColors, type AvatarDrawing } from "./shared";

export function Avatar({
  person,
}: {
  person: {
    name: string;
    emoji?: string;
    avatarPhoto?: string;
    avatar?: AvatarDrawing;
  };
}) {
  return (
    <span className="avatar-icon" aria-hidden="true">
      {person.avatarPhoto ? (
        <img src={person.avatarPhoto} alt="" />
      ) : person.avatar?.length ? (
        <Drawing drawing={person.avatar} />
      ) : (
        person.emoji || person.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
function Drawing({ drawing }: { drawing: AvatarDrawing }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      {drawing.map((s, i) =>
        s.points.length === 1 ? (
          <circle
            key={i}
            cx={s.points[0][0]}
            cy={s.points[0][1]}
            r="2"
            fill={s.color}
          />
        ) : (
          <polyline
            key={i}
            points={s.points.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
    </svg>
  );
}
export function DrawingPad({
  value,
  onChange,
  disabled = false,
}: {
  value: AvatarDrawing;
  onChange: (v: AvatarDrawing) => void;
  disabled?: boolean;
}) {
  const [color, setColor] = useState<string>(avatarColors[0]);
  const helpId = useId();
  const [pen, setPen] = useState<[number, number]>([50, 50]);
  const [keyboard, setKeyboard] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const count = () => latest.current.reduce((n, s) => n + s.points.length, 0);
  const point = (e: PointerEvent): [number, number] => {
    const box = surface.current!.getBoundingClientRect();
    return [
      Math.round(
        Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100)),
      ),
      Math.round(
        Math.max(0, Math.min(100, ((e.clientY - box.top) / box.height) * 100)),
      ),
    ];
  };
  const update = (v: AvatarDrawing) => {
    latest.current = v;
    onChange(v);
  };
  const end = (e: PointerEvent) => {
    if (active.current === e.pointerId) active.current = null;
  };
  return (
    <div className="drawing-pad">
      <p className="small muted" id={helpId}>
        Draw with your finger or mouse. Scroll outside the drawing area to move
        the page. Keyboard: use arrow keys to position the pen and Space to add
        a point.
      </p>
      <div
        ref={surface}
        className="drawing-surface"
        role="img"
        aria-label="Avatar drawing area"
        aria-describedby={helpId}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          const arrows: Record<string, [number, number]> = {
            ArrowLeft: [-5, 0],
            ArrowRight: [5, 0],
            ArrowUp: [0, -5],
            ArrowDown: [0, 5],
          };
          if (arrows[e.key]) {
            e.preventDefault();
            setKeyboard(true);
            const delta = arrows[e.key];
            setPen(([x, y]) => [
              Math.max(0, Math.min(100, x + delta[0])),
              Math.max(0, Math.min(100, y + delta[1])),
            ]);
          } else if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            setKeyboard(true);
            if (count() >= 1000) return;
            const strokes = latest.current;
            const last = strokes.at(-1);
            if (last && last.color === color)
              update([
                ...strokes.slice(0, -1),
                { ...last, points: [...last.points, pen] },
              ]);
            else if (strokes.length < 60)
              update([...strokes, { color, points: [pen] }]);
          }
        }}
        onPointerDown={(e) => {
          if (
            disabled ||
            active.current !== null ||
            (e.pointerType === "mouse" && e.button !== 0) ||
            value.length >= 60 ||
            count() >= 1000
          )
            return;
          e.preventDefault();
          setKeyboard(false);
          e.currentTarget.setPointerCapture(e.pointerId);
          active.current = e.pointerId;
          update([...latest.current, { color, points: [point(e)] }]);
        }}
        onPointerMove={(e) => {
          if (disabled || active.current !== e.pointerId || count() >= 1000)
            return;
          const next = point(e);
          const strokes = latest.current;
          const last = strokes.at(-1)!;
          const prior = last.points.at(-1)!;
          if (next[0] === prior[0] && next[1] === prior[1]) return;
          update([
            ...strokes.slice(0, -1),
            { ...last, points: [...last.points, next] },
          ]);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        <Drawing drawing={value} />
        {keyboard && (
          <svg
            className="drawing-cursor"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <circle
              cx={pen[0]}
              cy={pen[1]}
              r="3"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
          </svg>
        )}
        {!value.length && (
          <span className="drawing-hint">Draw your icon here</span>
        )}
      </div>
      <div className="drawing-tools" role="group" aria-label="Drawing tools">
        {avatarColors.map((c, i) => (
          <button
            type="button"
            key={c}
            disabled={disabled}
            aria-label={["Gold ink", "Rose ink", "Cream ink", "Blue ink"][i]}
            aria-pressed={color === c}
            className={color === c ? "selected" : ""}
            onClick={() => setColor(c)}
          >
            <span style={{ background: c }} />
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || !value.length}
          onClick={() => update(value.slice(0, -1))}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={disabled || !value.length}
          onClick={() => update([])}
        >
          Clear drawing
        </button>
      </div>
      {(value.length >= 60 || count() >= 1000) && (
        <p className="small muted">
          Drawing is full. Undo or clear to make more room.
        </p>
      )}
    </div>
  );
}
