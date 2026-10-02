import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { PublicEvent } from "./shared";

type Status = {
  status: "none" | "pending" | "approved" | "denied" | "expired";
  name?: string;
  participantId?: string;
};
export function RecoverSeat({
  event,
  onJoined,
}: {
  event: PublicEvent;
  onJoined: (e: PublicEvent) => void;
}) {
  const [participantId, setParticipantId] = useState("");
  const [status, setStatus] = useState<Status>({ status: "none" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const joined = useRef(onJoined);
  joined.current = onJoined;
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const next = await api<Status>(`/events/${event.id}/recovery`);
        if (stopped) return;
        setStatus(next);
        if (next.participantId) setParticipantId(next.participantId);
        setError("");
        if (next.status === "approved") {
          const restored = await api<PublicEvent>(`/events/${event.id}`);
          if (!stopped && restored.me) joined.current(restored);
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1800);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [event.id]);
  return (
    <section className="seat-recovery" aria-label="Recover your seat">
      <p>
        Your host will approve access to your saved seat. Choose your existing
        name and let them know you’re recovering.
      </p>
      <div role="status">
        {status.status === "pending" && (
          <p className="warning">
            Waiting for your host to approve {status.name || "your seat"}. Keep
            this page open. Requests expire after 15 minutes.
          </p>
        )}
        {status.status === "denied" && (
          <p>
            Your host denied this request. Speak to your host before trying
            again.
          </p>
        )}
        {status.status === "expired" && (
          <p>
            This request expired or the seat was removed. You can ask again or
            request a recovery link from your host.
          </p>
        )}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const next = await api<Status>(
              `/events/${event.id}/recover`,
              "POST",
              { participantId },
            );
            setStatus({
              ...next,
              name: event.tableGuests.find((p) => p.id === participantId)?.name,
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="recover-seat">Your existing display name</label>
        <select
          id="recover-seat"
          required
          value={participantId}
          onChange={(e) => setParticipantId(e.target.value)}
          disabled={busy || status.status === "pending"}
        >
          <option value="">Choose your seat</option>
          {event.tableGuests.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          className="primary"
          disabled={busy || status.status === "pending" || !participantId}
        >
          {busy ? "Requesting…" : "Ask host to approve"}
        </button>
      </form>
      {!event.tableGuests.length && <p>No guests have joined yet.</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

export function RecoveryLinkArrival({
  id,
  onJoined,
}: {
  id: string;
  onJoined: (e: PublicEvent) => void;
}) {
  const [secret] = useState(() =>
    new URLSearchParams(location.hash.slice(1)).get("recover"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  if (!secret || done) return null;
  // Explicit redemption keeps link previews and accidental navigation from consuming a link.
  return (
    <section className="narrow panel" aria-label="Recovery link">
      <h2>Restore your saved seat</h2>
      <p>
        Your host shared a single-use recovery link. Open it in the browser
        you’ll use for tasting.
      </p>
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const restored = await api<PublicEvent>(
              `/events/${id}/recovery-link/redeem`,
              "POST",
              { secret },
            );
            history.replaceState(null, "", location.pathname + location.search);
            setDone(true);
            onJoined(restored);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Restoring…" : "Recover my seat with this link"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function HostRecoveryRequests({
  event,
  disabled,
  onSaved,
}: {
  event: PublicEvent;
  disabled: boolean;
  onSaved: (e: PublicEvent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!event.recoveryRequests?.length && !error) return null;
  return (
    <section
      className="panel recovery-requests"
      aria-label="Seat recovery requests"
    >
      <h2>Seat recovery requests</h2>
      <p className="small muted">
        Confirm with the guest in person before approving. Their saved scorecard
        and existing sessions stay intact.
      </p>
      {event.recoveryRequests?.map((request) => (
        <div className="recovery-request" key={request.id}>
          <strong>{request.name} wants to recover their seat</strong>
          <div className="actions">
            {(["approve", "deny"] as const).map((decision) => (
              <button
                key={decision}
                className={decision === "approve" ? "primary" : ""}
                disabled={busy || disabled}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    onSaved(
                      await api<PublicEvent>(
                        `/events/${event.id}/recovery/${request.id}`,
                        "POST",
                        { decision },
                      ),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
                aria-label={`${decision === "approve" ? "Approve" : "Deny"} recovery for ${request.name}`}
              >
                {decision === "approve" ? "Approve" : "Deny"}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

export function CreateRecoveryLink({
  eventId,
  participantId,
  name,
  disabled,
}: {
  eventId: string;
  participantId: string;
  name: string;
  disabled: boolean;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  return (
    <section
      className="host-tool recovery-link"
      aria-label={`Recovery link for ${name}`}
    >
      <p className="small muted">
        Share only with {name}. The link expires after 10 minutes and works
        once. Creating a new link replaces their previous unused link.
      </p>
      <button
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          setError("");
          setCopied(false);
          setUrl("");
          try {
            const result = await api<{ path: string }>(
              `/events/${eventId}/recovery-link`,
              "POST",
              { participantId },
            );
            setUrl(location.origin + result.path);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Creating…" : "Create recovery link"}
      </button>
      {url && (
        <>
          <label>
            Recovery URL
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
          </label>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              } catch {
                setError("Select and copy the recovery URL above.");
              }
            }}
          >
            Copy recovery link
          </button>
          {copied && <p role="status">Recovery link copied.</p>}
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
