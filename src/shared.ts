export const replayDemoId = "9681e53e9196cc78b882d0ccc9240e72";
export const avatarColors = [
  "#d6ad69",
  "#e9a0ad",
  "#f5ede3",
  "#8cc7df",
] as const;
export type AvatarDrawing = { color: string; points: [number, number][] }[];
export function validAvatar(value: unknown): value is AvatarDrawing {
  if (!Array.isArray(value) || value.length > 60) return false;
  let count = 0;
  return value.every((stroke) => {
    if (
      !stroke ||
      typeof stroke !== "object" ||
      !avatarColors.includes(stroke.color) ||
      !Array.isArray(stroke.points) ||
      !stroke.points.length
    )
      return false;
    count += stroke.points.length;
    return (
      count <= 1000 &&
      stroke.points.every(
        (p: unknown) =>
          Array.isArray(p) &&
          p.length === 2 &&
          p.every(
            (n) =>
              typeof n === "number" &&
              Number.isInteger(n) &&
              n >= 0 &&
              n <= 100,
          ),
      )
    );
  });
}
export function validAvatarPhoto(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 130000 &&
    /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}
export const choices = [
  "Pinot Noir",
  "Grenache",
  "Rosso di Montepulciano",
  "Malbec",
  "Chianti Classico",
  "Tempranillo",
  "Cabernet Sauvignon",
  "Merlot",
] as const;
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = (word: string | undefined) =>
    Array.from(word || "")[0]?.toLocaleUpperCase() || "";
  return (
    (first(words[0]) + (words.length > 1 ? first(words.at(-1)) : "")).slice(
      0,
      4,
    ) || "?"
  );
}
export type Entry = {
  enteredBy?: "host";
  guess: string;
  rating: number | null;
  notes: string;
  revision: number;
};
export type Participant = {
  id: string;
  name: string;
  emoji: string;
  avatar?: AvatarDrawing;
  avatarPhoto?: string;
  entries: Record<string, Entry>;
  practice?: Entry;
  submitted: boolean;
  tokenHash: string;
  draftScope?: boolean;
  tokenAliases?: string[];
  recoveryHash?: string;
  recoveryFailures?: number;
  recoveryBlockedUntil?: number;
};
export type EventWine = { type: string; producer: string };
export type Seating = {
  shape: "round" | "square" | "rectangle";
  seats: (string | null)[];
};
export type TableGuest = Pick<
  PublicParticipant,
  "id" | "name" | "emoji" | "avatar" | "avatarPhoto"
> & { ready: boolean };
export type KeyCorrection = {
  at: string;
  generation: number;
  before: string[];
  after: string[];
  reason: string;
};
export type RoundTimer = {
  round: number;
  durationMs: number;
  remainingMs: number;
  endsAt?: number;
};
export function timerRemaining(timer: RoundTimer, now: number) {
  return Math.max(
    0,
    timer.endsAt === undefined ? timer.remainingMs : timer.endsAt - now,
  );
}
export type RevealCountdown = {
  round: number;
  endsAt: number;
  startsAt?: number;
};
export type RevealStage = {
  round: number;
  startsAt: number;
  paradeEndsAt: number;
};
export type ParadeGuess = Pick<
  WineResult["guesses"][number],
  "name" | "emoji" | "avatar" | "avatarPhoto" | "guess" | "rating"
>;
export type RecoveryRequest = {
  id: string;
  participantId: string;
  tokenHash: string;
  status: "pending" | "approved" | "denied";
  createdAt: number;
  expiresAt: number;
};
export type Event = {
  recoveryRequests?: RecoveryRequest[];
  recoveryLinks?: {
    participantId: string;
    secretHash: string;
    expiresAt: number;
  }[];
  revealCountdown?: RevealCountdown;
  revealStage?: RevealStage;
  bottlePhotos?: Record<string, string>;
  keyCorrections?: KeyCorrection[];
  roundTimer?: RoundTimer;
  seating?: Seating;
  wines?: EventWine[];
  id: string;
  name: string;
  key: string[];
  phase: "setup" | "tasting" | "locked" | "summary";
  unlocked: number;
  revealed: number;
  presenting: number;
  revision: number;
  controlRevision: number;
  generation: number;
  participants: Participant[];
  createdAt: string;
};
export function validRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 10 &&
    Math.abs(value * 10 - Math.round(value * 10)) < 1e-8
  );
}
export function conflicts(entries: Record<string, Entry>) {
  const out: Record<string, number[]> = Object.create(null);
  for (let r = 1; r <= 8; r++) {
    const g = entries[r]?.guess;
    if (g) (out[g] ??= []).push(r);
  }
  return Object.values(out).filter((rs) => rs.length > 1);
}
export function eventChoices(event: Pick<Event, "wines">): string[] {
  return event.wines?.map((w) => w.type) ?? [...choices];
}
export function validation(
  entries: Record<string, Entry>,
  allowed: readonly string[] = choices,
) {
  const missing = Array.from({ length: 8 }, (_, i) => i + 1).filter(
    (r) =>
      !allowed.includes(entries[r]?.guess) || !validRating(entries[r]?.rating),
  );
  const duplicates = conflicts(entries);
  return {
    valid: missing.length === 0 && duplicates.length === 0,
    missing,
    duplicates,
  };
}
export type PublicParticipant = {
  id: string;
  name: string;
  emoji: string;
  avatar?: AvatarDrawing;
  avatarPhoto?: string;
  submitted: boolean;
  valid: boolean;
  missing: number[];
  duplicates: number[][];
};
export type HostParticipant = PublicParticipant & {
  entries: Record<string, Entry>;
  correctCount: number;
};
export type WineResult = {
  round: number;
  wine?: string;
  producer?: string;
  bottlePhoto?: string;
  purchaseUrl?: string;
  distribution: Record<string, number>;
  guesses: {
    name: string;
    emoji: string;
    avatar?: AvatarDrawing;
    avatarPhoto?: string;
    guess: string;
    correct?: boolean;
    rating?: number | null;
    ratingIncluded?: boolean;
  }[];
  average?: number | null;
  count?: number;
};
export type PublicEvent = {
  revealCountdown?: RevealCountdown;
  revealStage?: RevealStage;
  parade?: { round: number; guesses: ParadeGuess[] };
  bottlePhotos?: Record<string, string>;
  keyCorrections?: KeyCorrection[];
  roundTimer?: RoundTimer;
  serverTime?: number;
  seating?: Seating;
  tableGuests: TableGuest[];
  choices: string[];
  wines?: EventWine[];
  id: string;
  name: string;
  phase: Event["phase"];
  unlocked: number;
  revealed: number;
  presenting: number;
  revision: number;
  controlRevision?: number;
  generation: number;
  participants: number;
  completed: number;
  results: WineResult[];
  summary?: {
    leaderboard: {
      name: string;
      emoji: string;
      avatar?: AvatarDrawing;
      avatarPhoto?: string;
      score: number;
      rank: number;
      incomplete: boolean;
    }[];
    wines: WineResult[];
    most: string[];
    fewest: string[];
    highest: string[];
    lowest: string[];
  };
  me?: Omit<
    Participant,
    | "tokenHash"
    | "tokenAliases"
    | "recoveryHash"
    | "recoveryFailures"
    | "recoveryBlockedUntil"
  >;
  recoveryRequests?: {
    id: string;
    participantId: string;
    name: string;
    createdAt: number;
    expiresAt: number;
  }[];
  roster?: HostParticipant[];
  key?: string[];
};

/** Deliberately excludes all answer-key, reveal, producer, photo and note data. */
export type AssistedEvent = {
  id: string;
  name: string;
  phase: Event["phase"];
  unlocked: number;
  revision: number;
  generation: number;
  choices: string[];
  guests: {
    id: string;
    name: string;
    submitted: boolean;
    valid: boolean;
    missing: number[];
    duplicates: number[][];
    entries: Record<string, Omit<Entry, "notes">>;
  }[];
};
