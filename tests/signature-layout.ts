import { chromium, expect } from "playwright/test";
import assert from "node:assert/strict";
const origin = process.env.TEST_URL || "http://127.0.0.1:3025";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const c = await b.newContext({ viewport: { width: 1280, height: 720 } }),
  p = await c.newPage();
const path = `/api/events/${"b".repeat(32)}`;
const final = await (
  await c.request.get(origin + path + "?view=projector")
).json();
assert.ok(final.summary);
let fixture = structuredClone(final);
await c.route("**/api/events/**", (r) => r.fulfill({ json: fixture }));
try {
  for (const mode of ["long-names-reveal", "all-ties-summary"]) {
    fixture = structuredClone(final);
    fixture.serverTime = Date.now();
    if (mode === "long-names-reveal") {
      fixture.phase = "locked";
      delete fixture.summary;
      fixture.revealed = 8;
      fixture.presenting = 8;
      fixture.results[7].guesses.forEach(
        (g: any, i: number) =>
          (g.name = `Alexandria Montgomery Guest ${i + 1}`),
      );
    } else {
      fixture.summary.leaderboard.forEach((g: any, i: number) => {
        g.name = `Alexandria Montgomery Guest ${i + 1}`;
        g.score = 8;
        g.rank = 1;
      });
      fixture.summary.wines.forEach((w: any) => (w.average = 8));
    }
    await p.goto(origin + `/projector/e/${"b".repeat(32)}`);
    await expect(
      p.locator(mode === "long-names-reveal" ? ".parade-card" : ".champion"),
    ).toHaveCount(11);
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]) {
      await p.setViewportSize(viewport);
      const dimensions = await p.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      }));
      await p.screenshot({
        path: `test-artifacts/signature/${mode}-${viewport.width}.png`,
        fullPage: true,
      });
      console.log(
        JSON.stringify({
          mode,
          ...dimensions,
          sections: await p
            .locator(
              ".signature-awards,.final-wines,.evening-stats,.champion-panel,.favorite-panel",
            )
            .evaluateAll((els) =>
              els.map((el) => ({
                class: el.className,
                height: el.getBoundingClientRect().height,
              })),
            ),
        }),
      );
      assert.ok(
        dimensions.width <= viewport.width &&
          dimensions.height <= viewport.height,
      );
    }
  }
} finally {
  await b.close();
}
