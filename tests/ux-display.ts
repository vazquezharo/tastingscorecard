import { chromium, request } from "playwright";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { choices } from "../src/shared.ts";
const origin = process.env.TEST_URL || "http://127.0.0.1:3010";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const api = await request.newContext({
  baseURL: origin,
  extraHTTPHeaders: { Origin: origin },
});
assert.equal(
  (
    await api.post("/api/host/login", {
      data: { password: process.env.HOST_PASSWORD },
    })
  ).status(),
  200,
);
let e = await (
  await api.post("/api/host/events", {
    data: { name: "Demo · twelve-person display" },
  })
).json();
async function control(action: string, extra = {}) {
  e = await (await api.get(`/api/events/${e.id}?host=1`)).json();
  assert.equal(
    (
      await api.post(`/api/events/${e.id}/control`, {
        data: { action, revision: e.controlRevision, ...extra },
      })
    ).status(),
    200,
  );
}
await control("key", { key: choices });
await control("start");
for (let i = 0; i < 12; i++) {
  const token = crypto.randomUUID();
  const headers = { "X-Guest-Token": token };
  assert.equal(
    (
      await api.post(`/api/events/${e.id}/join`, {
        headers,
        data: {
          name: `Guest ${i + 1}`,
          pin: "4826",
          avatar: [
            {
              color: "#d6ad69",
              points: [
                [20, 20],
                [70, 70],
              ],
            },
          ],
        },
      })
    ).status(),
    200,
  );
  assert.equal(
    (
      await api.put(`/api/events/${e.id}/entries/1`, {
        headers,
        data: {
          guess: choices[i % 8],
          rating: 7,
          notes: "PRIVATE",
          revision: 0,
        },
      })
    ).status(),
    200,
  );
}
for (let i = 1; i < 8; i++) await control("unlock");
await control("lock", { override: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const c = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    reducedMotion: "reduce",
  });
  const p = await c.newPage();
  await p.goto(`${origin}/projector/e/${e.id}`);
  await p.locator(".guess-list > div").last().waitFor();
  assert.equal(await p.locator(".guess-list > div").count(), 12);
  await p.screenshot({
    path: "docs/ux-audit/after/twelve-guests-display.png",
    fullPage: true,
  });
  await control("reveal");
  await p.getByText("No eligible ratings", { exact: false }).waitFor();
  assert.ok(!(await p.locator("body").innerText()).includes("PRIVATE"));
  assert.equal(
    await p
      .locator(".wine-revealed")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await p.screenshot({
    path: "docs/ux-audit/after/no-eligible-ratings-display.png",
    fullPage: true,
  });
  const dimensions = await p.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
    viewportHeight: innerHeight,
    viewportWidth: innerWidth,
  }));
  writeFileSync(
    "docs/ux-audit/after/display-report.json",
    JSON.stringify(
      {
        participants: 12,
        reducedMotion: true,
        noEligibleRatings: true,
        privateNotes: true,
        dimensions,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, dimensions }));
} finally {
  await browser.close();
  await api.dispose();
}
