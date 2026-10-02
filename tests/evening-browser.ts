import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { choices } from "../src/shared.ts";
const origin = process.env.TEST_URL || "http://127.0.0.1:3019";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const hostContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const guestContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const displayContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
});
const [host, guest, display] = await Promise.all([
  hostContext.newPage(),
  guestContext.newPage(),
  displayContext.newPage(),
]);
const errors: string[] = [];
for (const page of [host, guest, display])
  page.on("pageerror", (error) => errors.push(error.message));
mkdirSync("test-artifacts", { recursive: true });
try {
  const login = await hostContext.request.post(origin + "/api/host/login", {
    data: { password: process.env.TEST_PASSWORD || "local-rehearsal-only" },
  });
  assert.equal(login.status(), 200);
  const created = await hostContext.request.post(origin + "/api/host/events", {
    data: { name: "Demo · A memorable evening" },
  });
  const event = await created.json();
  const path = `/api/events/${event.id}`;
  async function control(action: string, extra = {}) {
    const current = await (
      await hostContext.request.get(origin + path + "?host=1")
    ).json();
    const response = await hostContext.request.post(
      origin + path + "/control",
      { data: { action, revision: current.controlRevision, ...extra } },
    );
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  }
  await host.goto(origin + `/host/e/${event.id}`);
  await host.getByText("Add bottle photos (optional)", { exact: true }).click();
  const jpeg = await sharp({
    create: { width: 180, height: 480, channels: 3, background: "#792847" },
  })
    .jpeg()
    .toBuffer();
  await host
    .getByLabel(`${choices[0]} bottle photo`, { exact: true })
    .setInputFiles({
      name: "bottle.jpg",
      mimeType: "image/jpeg",
      buffer: jpeg,
    });
  await host.getByAltText(`${choices[0]} bottle preview`).waitFor();
  const token = randomUUID();
  await guest.goto(origin);
  await guest.evaluate(
    (token) => localStorage.setItem("tasting.identity.v1", token),
    token,
  );
  const headers = { "X-Guest-Token": token };
  const joined = await guestContext.request.post(origin + path + "/join", {
    headers,
    data: {
      name: "UniqueGuestName",
      pin: "4826",
      avatar: [{ color: "#d6ad69", points: [[10, 10]] }],
    },
  });
  assert.equal(joined.status(), 200);
  await control("key", { key: [...choices] });
  await control("start");
  for (let round = 1; round <= 8; round++) {
    if (round > 1) await control("unlock");
    const save = await guestContext.request.put(
      origin + path + `/entries/${round}`,
      {
        headers,
        data: {
          guess: choices[round - 1],
          rating: round <= 2 ? 9 : 6,
          notes: "PRIVATE_NOTES_SENTINEL",
          revision: 0,
        },
      },
    );
    assert.equal(save.status(), 200);
  }
  assert.equal(
    (
      await guestContext.request.post(origin + path + "/submit", {
        headers,
        data: {},
      })
    ).status(),
    200,
  );
  await control("lock");
  await Promise.all([
    guest.goto(origin + `/e/${event.id}`),
    display.goto(origin + `/projector/e/${event.id}`),
  ]);
  await host.reload();
  await host.getByLabel("Three-second reveal countdown").check();
  await host
    .getByRole("button", { name: "Reveal wine 1", exact: true })
    .click();
  await Promise.all([
    guest
      .getByRole("heading", { name: "Final Scorecard", exact: true })
      .waitFor(),
    display.getByLabel("Round 1 reveal countdown").waitFor(),
  ]);
  const hidden = await (
    await guestContext.request.get(origin + path + "?view=projector")
  ).json();
  assert.equal(hidden.results[0].wine, undefined);
  assert.equal(hidden.results[0].bottlePhoto, undefined);
  await display.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await display
      .locator(".reveal-countdown > strong")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await guest.reload();
  await guest
    .locator(".personal-round:nth-child(1) .personal-answer strong")
    .waitFor();
  await display.getByAltText(`${choices[0]} bottle`, { exact: true }).waitFor();
  assert.equal(await display.locator(".taste-insights").count(), 0);
  for (let round = 2; round <= 8; round++) {
    await control("next");
    await control("reveal");
  }
  await control("summary");
  await guest
    .getByRole("heading", { name: "Your taste, by the glass" })
    .waitFor();
  assert.match(
    await guest.locator(".taste-insights").innerText(),
    /Pinot Noir, Grenache/,
  );
  assert.match(await guest.locator(".taste-insights").innerText(), /6.0–9.0/);
  await guest.evaluate(() => {
    const original = CanvasRenderingContext2D.prototype.fillText;
    (window as any).__recapText = [];
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      (window as any).__recapText.push(text);
      return original.call(this, text, ...args);
    };
  });
  if (
    !(await guest
      .locator(".final-shared-results")
      .evaluate((el) => (el as HTMLDetailsElement).open))
  )
    await guest
      .getByText("Final rankings & evening recap", { exact: true })
      .click();
  await guest.getByRole("button", { name: "Preview evening recap" }).click();
  await guest.getByRole("link", { name: "Download recap PNG" }).waitFor();
  const drawn = await guest.evaluate(() =>
    (window as any).__recapText.join("\n"),
  );
  assert.ok(!drawn.includes("UniqueGuestName"));
  assert.ok(!drawn.includes("PRIVATE_NOTES_SENTINEL"));
  assert.ok(drawn.includes(event.name));
  assert.ok(drawn.includes(choices[7]));
  const downloadPromise = guest.waitForEvent("download");
  await guest.getByRole("link", { name: "Download recap PNG" }).click();
  const download = await downloadPromise;
  await download.saveAs("test-artifacts/evening-recap.png");
  const metadata = await sharp("test-artifacts/evening-recap.png").metadata();
  assert.equal(metadata.width, 1080);
  assert.ok(metadata.height! > 1000);
  await guest.getByLabel("Include leaderboard and guest names").check();
  if (
    !(await guest
      .locator(".final-shared-results")
      .evaluate((el) => (el as HTMLDetailsElement).open))
  )
    await guest
      .getByText("Final rankings & evening recap", { exact: true })
      .click();
  await guest.getByRole("button", { name: "Preview evening recap" }).click();
  await guest.getByRole("link", { name: "Download recap PNG" }).waitFor();
  const included = await guest.evaluate(() =>
    (window as any).__recapText.join("\n"),
  );
  assert.ok(included.includes("UniqueGuestName"));
  assert.ok(!included.includes("PRIVATE_NOTES_SENTINEL"));
  await guest.reload();
  await guest
    .getByRole("heading", { name: "Your taste, by the glass" })
    .waitFor();
  await display.reload();
  assert.equal(await display.locator(".taste-insights").count(), 0);
  const violations = await new AxeBuilder({ page: guest })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.deepEqual(violations.violations, []);
  assert.equal(
    await guest.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await guest.screenshot({
    path: "test-artifacts/taste-insights-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      event: event.id,
      checks: [
        "host photo upload",
        "countdown secrecy and real expiry",
        "independent guest/display sync",
        "refresh",
        "reduced motion",
        "tied personal favorites and range",
        "private insights",
        "PNG download",
        "leaderboard opt-in",
        "notes excluded",
        "mobile overflow",
        "accessibility",
        "no page errors",
      ],
    }),
  );
} finally {
  await browser.close();
}
