// Server only. Never import this module in browser code.
export const producers: Record<string, string> = {
  "Pinot Noir": "St. Francis",
  Grenache: "Halos de Jupiter",
  "Rosso di Montepulciano": "Redi",
  Malbec: "Edmundo",
  "Chianti Classico": "Cantalici Baruffo",
  Tempranillo: "La Enfermera",
  "Cabernet Sauvignon": "J. Lohr Seven Oaks",
  Merlot: "Kendall-Jackson Vintner’s Reserve",
};

// Exact links supplied by the host. Keep bottle identities out of browser bundles.
const purchaseLinks: Record<string, string> = {
  "Pinot Noir":
    "https://www.totalwine.com/wine/red-wine/pinot-noir/st-francis-pinot-noir-sonoma-county/p/219691750",
  Grenache:
    "https://www.totalwine.com/wine/red-wine/grenache/halos-de-jupiter-grenache/p/2126221994",
  "Rosso di Montepulciano":
    "https://www.totalwine.com/wine/red-wine/sangiovese/redi-rosso-di-montepulciano/p/94524750",
  Malbec:
    "https://www.totalwine.com/wine/red-wine/malbec/ed-edmundo-malbec/p/235698750",
  "Chianti Classico":
    "https://www.totalwine.com/wine/red-wine/sangiovese/cantalici-chianti-classico-baruffo/p/234849750",
  Tempranillo:
    "https://www.totalwine.com/wine/red-wine/tempranillo/uro-toro-la-enfermera-tempranillo/p/178708750",
  "Cabernet Sauvignon":
    "https://www.totalwine.com/wine/red-wine/cabernet-sauvignon/j-lohr-estates-seven-oaks-cabernet-sauvignon/p/260750",
  Merlot:
    "https://www.totalwine.com/wine/red-wine/merlot/kendall-jackson-merlot/p/2400750",
};

// Private bottle names from the supplied retailer links; not public answer choices.
const bottleNames: Record<string, string> = {
  "Pinot Noir": "St. Francis Pinot Noir · Sonoma County",
  Grenache: "Halos de Jupiter Grenache",
  "Rosso di Montepulciano": "Redi Rosso di Montepulciano",
  Malbec: "Ed Edmundo Malbec",
  "Chianti Classico": "Cantalici Chianti Classico Baruffo",
  Tempranillo: "Uro Toro La Enfermera Tempranillo",
  "Cabernet Sauvignon": "J. Lohr Estates Seven Oaks Cabernet Sauvignon",
  Merlot: "Kendall-Jackson Vintner’s Reserve Merlot",
};

export function bottleName(type: string, producer: string) {
  return Object.hasOwn(producers, type) && producer === producers[type]
    ? bottleNames[type]
    : `${producer} · ${type}`;
}

export function purchaseLink(type: string, producer: string) {
  return Object.hasOwn(producers, type) && producer === producers[type]
    ? purchaseLinks[type]
    : undefined;
}
