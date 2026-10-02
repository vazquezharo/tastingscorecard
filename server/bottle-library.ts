import { readFileSync } from "node:fs";
import { producers } from "./wines.js";

// Original photos supplied in the host's Wine photos Drive folder.
// Server-only files: never publish these as static/browser assets.
const files: Record<string, string> = {
  "Pinot Noir": "pinot-noir.png",
  Grenache: "grenache.jpg",
  "Rosso di Montepulciano": "rosso-di-montepulciano.png",
  Malbec: "malbec.jpg",
  "Chianti Classico": "chianti-classico.jpg",
  Tempranillo: "tempranillo.jpg",
  "Cabernet Sauvignon": "cabernet-sauvignon.png",
  Merlot: "merlot.jpg",
};

export function hasLibraryBottle(type: string, producer: string) {
  return Object.hasOwn(files, type) && producer === producers[type];
}

export function libraryBottlePhoto(type: string, producer: string) {
  if (!hasLibraryBottle(type, producer)) return undefined;
  const file = files[type];
  return {
    bytes: readFileSync(new URL(`./bottle-images/${file}`, import.meta.url)),
    mime: file.endsWith(".png") ? "image/png" : "image/jpeg",
  };
}

export function libraryPhotoUrl(eventId: string, round: number) {
  return `${process.env.BASE_PATH || ""}/api/events/${eventId}/bottle-photo/${round}`;
}
