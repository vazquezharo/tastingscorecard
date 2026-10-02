import { useId, useState, useRef } from "react";
export function PhotoPicker({
  value,
  onChange,
  disabled = false,
  onBusy,
}: {
  value: string;
  onChange: (photo: string) => void;
  disabled?: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const id = useId();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  return (
    <div className="photo-picker">
      <label className="button photo-upload" htmlFor={id}>
        {loading
          ? "Preparing photo…"
          : value
            ? "Replace photo"
            : "Upload a photo"}
        <input
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          aria-label="Avatar photo"
          disabled={disabled || loading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError("");
            if (file.size > 20 * 1024 * 1024) {
              setError("Choose a photo smaller than 20 MB.");
              return;
            }
            if (
              file.type &&
              ![
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/heic",
                "image/heif",
              ].includes(file.type)
            ) {
              setError("Choose a JPEG, PNG or WebP photo.");
              return;
            }
            const current = ++sequence.current;
            setLoading(true);
            onBusy(true);
            const url = URL.createObjectURL(file);
            try {
              const image = new Image();
              image.src = url;
              await image.decode();
              const canvas = document.createElement("canvas");
              canvas.width = 256;
              canvas.height = 256;
              const ctx = canvas.getContext("2d");
              if (!ctx) throw new Error();
              const side = Math.min(image.naturalWidth, image.naturalHeight);
              if (!side) throw new Error();
              ctx.fillStyle = "#fff";
              ctx.fillRect(0, 0, 256, 256);
              ctx.drawImage(
                image,
                (image.naturalWidth - side) / 2,
                (image.naturalHeight - side) / 2,
                side,
                side,
                0,
                0,
                256,
                256,
              );
              const photo = canvas.toDataURL("image/jpeg", 0.8);
              if (photo.length > 130000) throw new Error();
              if (current === sequence.current) onChange(photo);
            } catch {
              setError(
                "This photo could not be opened. Try a JPEG, PNG or WebP photo.",
              );
            } finally {
              URL.revokeObjectURL(url);
              setLoading(false);
              onBusy(false);
            }
          }}
        />
      </label>
      {value && (
        <>
          <img
            className="photo-preview"
            src={value}
            alt="Your selected avatar photo"
          />
          <button
            type="button"
            disabled={disabled || loading}
            onClick={() => onChange("")}
          >
            Use drawing instead
          </button>
        </>
      )}
      <p className="small muted">
        Photos are cropped to a square. Your avatar appears beside your name to
        the group.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
