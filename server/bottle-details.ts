import { eventChoices, type Event } from "../src/shared.js";
import { producers, purchaseLink, bottleName } from "./wines.js";
import { hasLibraryBottle } from "./bottle-library.js";
import { tonightBottle } from "./tonight-bottles.js";

// Shared by host verification and revealed results so both resolve the same bottle.
export function bottleDetails(e: Event, type: string) {
  const round = e.key.indexOf(type) + 1;
  const configured = round ? tonightBottle(e, round) : undefined;
  const producer =
    configured?.producer ??
    e.wines?.find((w) => w.type === type)?.producer ??
    producers[type] ??
    "";
  return {
    type,
    producer,
    name: bottleName(type, producer),
    image: configured?.image ?? e.bottlePhotos?.[type],
    library: hasLibraryBottle(type, producer),
    purchaseUrl: configured?.purchaseUrl ?? purchaseLink(type, producer),
  };
}

export function hostBottles(e: Event) {
  return eventChoices(e).map((type, index) => {
    const bottle = bottleDetails(e, type);
    return {
      type,
      name: bottle.name,
      photoUrl:
        bottle.image ??
        (bottle.library
          ? `${process.env.BASE_PATH || ""}/api/events/${e.id}/host-bottle-photo/${index}`
          : undefined),
      purchaseUrl: bottle.purchaseUrl,
    };
  });
}
