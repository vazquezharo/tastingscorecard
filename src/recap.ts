import type { PublicEvent } from "./shared";
/** Draw only explicitly selected public summary fields; never serialize a scorecard. */
export function renderRecap(
  event: PublicEvent,
  includeLeaderboard: boolean,
): string {
  if (!event.summary || event.phase !== "summary")
    throw new Error("Final results required.");
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable.");
  const ctx = context;
  const lines: { text: string; font: string; color: string; gap: number }[] =
    [];
  function add(
    text: string,
    size = 26,
    color = "#f5ede3",
    gap = 18,
    serif = false,
  ) {
    const font = `${size}px ${serif ? '"Playfair Display"' : '"DM Sans"'}, ${serif ? "serif" : "sans-serif"}`;
    ctx.font = font;
    // Break overlong tokens too, so long wine/event names never clip.
    let line = "";
    for (const char of text) {
      if (ctx.measureText(line + char).width > 936 && line) {
        const split = line.lastIndexOf(" ");
        if (split > line.length / 2) {
          lines.push({ text: line.slice(0, split), font, color, gap: 8 });
          line = line.slice(split + 1);
        } else {
          lines.push({ text: line, font, color, gap: 8 });
          line = "";
        }
      }
      line += char;
    }
    lines.push({ text: line, font, color, gap });
  }
  const summary = event.summary;
  add("THE BLIND TASTING · EVENING RECAP", 21, "#d6ad69", 28);
  add(event.name, 52, "#f5ede3", 32, true);
  add("Eight wines. One memorable evening.", 25, "#cbbfb5", 35);
  add("THE ROOM’S FAVORITES", 22, "#d6ad69", 18);
  add(
    summary.highest.join(" · ") || "No eligible submitted ratings",
    32,
    "#f5ede3",
    32,
    true,
  );
  add("ALL EIGHT WINES · RANKED BY GROUP RATING", 21, "#d6ad69", 24);
  summary.wines.forEach((wine) => {
    add(
      `${wine.wine}  ·  ${wine.average?.toFixed(1) ?? "—"} / 10`,
      30,
      "#f5ede3",
      5,
    );
    add(
      `${wine.producer} · Pour ${wine.round} · ${wine.count ?? 0} submitted ${wine.count === 1 ? "rating" : "ratings"}`,
      22,
      "#cbbfb5",
      25,
    );
  });
  if (includeLeaderboard) {
    add("THE LEADERBOARD", 22, "#d6ad69", 20);
    summary.leaderboard.forEach((guest) =>
      add(
        `${guest.rank}. ${guest.name} · ${guest.score}/8${guest.incomplete ? " · Incomplete" : ""}`,
        27,
        "#f5ede3",
        16,
      ),
    );
  }
  add(
    "Group averages use valid submitted scorecards. Ties share a rank.",
    20,
    "#cbbfb5",
    18,
  );
  add("tasting.haroldvazquez.com", 22, "#d6ad69", 0);
  canvas.height =
    144 +
    lines.reduce(
      (height, line) => height + parseInt(line.font) * 1.35 + line.gap,
      0,
    );
  ctx.fillStyle = "#171114";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#d6ad69";
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
  ctx.textBaseline = "top";
  let y = 72;
  for (const line of lines) {
    ctx.font = line.font;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, 72, y);
    y += parseInt(line.font) * 1.35 + line.gap;
  }
  return canvas.toDataURL("image/png");
}
