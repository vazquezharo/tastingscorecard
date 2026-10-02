import type { Event } from "../src/shared.js";

export type TonightBottles = {
  eventId: string;
  bottles: {
    type: string;
    producer: string;
    image?: string;
    purchaseUrl?: string;
  }[];
};
// Server-only. Populate once the host supplies tonight's event and exact bottles.
// Never import this module from src/. Never infer a bottle or retailer URL.
export const tonight: TonightBottles = { eventId: "", bottles: [] };

function httpsUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function tonightBottle(e: Event, round: number, config = tonight) {
  // Entire physical pouring order must match: fail closed if the key changes.
  if (
    !config.eventId ||
    e.id !== config.eventId ||
    config.bottles.length !== 8 ||
    e.key.length !== 8 ||
    !config.bottles.every((b, i) => b.type === e.key[i]) ||
    !Number.isInteger(round) ||
    round < 1 ||
    round > 8
  )
    return undefined;
  const bottle = config.bottles[round - 1];
  return {
    producer: bottle.producer,
    image: httpsUrl(bottle.image),
    purchaseUrl: httpsUrl(bottle.purchaseUrl),
  };
}
