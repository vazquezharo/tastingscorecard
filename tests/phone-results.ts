import { chromium, type Page } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { choices } from "../src/shared.ts";
const origin = process.env.TEST_URL || "http://127.0.0.1:3000";
const relay = process.env.TEST_TRUSTED_HTTPS_RELAY === "1";
const proxyOptions = relay
  ? { proxy: { server: process.env.HTTPS_PROXY! } }
  : {};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const contexts = await Promise.all([
  browser.newContext({
    ...proxyOptions,
    viewport: { width: 1280, height: 900 },
  }),
  browser.newContext({
    ...proxyOptions,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }),
  browser.newContext({
    ...proxyOptions,
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  }),
]);
if (relay)
  for (const c of contexts)
    await c.route(`${origin}/**`, async (route) => {
      try {
        await route.fulfill({ response: await route.fetch() });
      } catch {
        try {
          await route.abort();
        } catch {
          /* closing */
        }
      }
    });
const [host, alice, bob] = await Promise.all(contexts.map((c) => c.newPage()));
const guests = [alice, bob];
const errors: string[] = [];
let displayRequests = 0;
for (const page of [host, ...guests]) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (req) => {
    if (req.url().includes("/projector/")) displayRequests++;
  });
}
const visible = async (p: Page, text: string) =>
  p
    .getByText(text, { exact: false })
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 15000 });
const button = (p: Page, name: string) =>
  p.getByRole("button", { name, exact: true });
const roundShown = async (p: Page, r: number) => visible(p, `ROUND 0${r} ·`);
const revealed = async (p: Page, r: number) =>
  p
    .locator(".wine-revealed h1")
    .filter({ hasText: choices[r - 1] })
    .waitFor({ timeout: 15000 });
const snapshot = async (p: Page, id: string) =>
  p.evaluate(async (id) => (await fetch(`/api/events/${id}`)).json(), id);
try {
  await host.goto(`${origin}/host`);
  await host
    .getByLabel("Host password")
    .fill(
      process.env.TEST_PASSWORD ||
        process.env.HOST_PASSWORD ||
        "local-rehearsal-only",
    );
  await button(host, "Open host controls").click();
  await host
    .getByLabel("Name your evening")
    .fill("Demo · phone-only results rehearsal");
  await button(host, "Create event").click();
  await host.waitForURL(/\/host\/e\//);
  const id = host.url().split("/").at(-1)!;
  await host
    .getByRole("link", { name: "Open big-screen display", exact: true })
    .waitFor({ timeout: 15000 });
  for (const [i, page] of guests.entries()) {
    await page.goto(`${origin}/e/${id}`);
    await page.getByLabel("Your name").fill(i === 0 ? "Alex" : "Blair");
    if (i === 0) {
      assert.equal(
        await page.getByRole("group", { name: "Choose an emoji" }).count(),
        0,
      );
      await page.locator(".drawing-surface").scrollIntoViewIfNeeded();
      const box = (await page.locator(".drawing-surface").boundingBox())!;
      const touch = await contexts[1].newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: box.x + 40, y: box.y + 40 }],
      });
      for (const d of [60, 80, 100])
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: box.x + d, y: box.y + d }],
        });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await touch.detach();
      assert.equal(await page.locator(".drawing-surface polyline").count(), 1);
      await button(page, "Undo").click();
      assert.equal(await page.locator(".drawing-surface polyline").count(), 0);
      await page.locator(".drawing-surface").scrollIntoViewIfNeeded();
      const redrawBox = (await page.locator(".drawing-surface").boundingBox())!;
      await page.mouse.move(redrawBox.x + 60, redrawBox.y + 60);
      await page.mouse.down();
      await page.mouse.move(redrawBox.x + 120, redrawBox.y + 140, { steps: 8 });
      await page.mouse.up();
    }
    await page
      .getByLabel("Create a recovery PIN")
      .fill(i === 0 ? "4826" : "5731");
    if (i === 1) await page.locator(".drawing-surface").click();
    await button(page, "Take my seat").click();
    await visible(page, "A good night awaits.");
    if (i === 0) {
      assert.equal(
        await page.locator(".event-line .avatar-icon polyline").count(),
        1,
      );
      await page.reload();
      await page
        .locator(".event-line .avatar-icon polyline")
        .waitFor({ state: "attached" });
      await page.getByText("Draw or edit your icon", { exact: true }).click();
      await button(page, "Clear drawing").click();
      assert.equal(await page.locator(".drawing-surface polyline").count(), 0);
      await button(page, "Blue ink").click();
      await page.locator(".drawing-surface").scrollIntoViewIfNeeded();
      const box = (await page.locator(".drawing-surface").boundingBox())!;
      await page.mouse.move(box.x + 40, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 180, box.y + 100, { steps: 10 });
      await page.mouse.up();
      await button(page, "Save icon").click();
      await page
        .locator('.event-line .avatar-icon polyline[stroke="#8cc7df"]')
        .waitFor({ state: "attached" });
      await page.reload();
      await page
        .locator('.event-line .avatar-icon polyline[stroke="#8cc7df"]')
        .waitFor({ state: "attached" });
    }
  }
  for (let r = 1; r <= 8; r++)
    await host
      .getByLabel(`Answer for round ${r}`, { exact: true })
      .selectOption(choices[r - 1]);
  await button(host, "Save answer key").click();
  await button(host, "Start round 1").click();
  for (let r = 1; r <= 8; r++) {
    if (r > 1) await button(host, `Open round ${r}`).click();
    for (const page of guests) {
      await page.locator(`#guess-${r}`).waitFor();
      await page.locator(`#guess-${r}`).selectOption(choices[r - 1]);
      await button(page, "7.0").last().click();
      if (r === 1)
        await page.locator("#notes-1").fill("PRIVATE phone-only note");
      await page
        .locator(".round-card:not([hidden]) .save-state.confirmed")
        .waitFor({ timeout: 15000 });
    }
  }
  for (const page of guests) {
    await button(page, "Review scorecard").click();
    await button(page, "Submit scorecard").click();
    await visible(page, "Scorecard submitted");
  }
  await visible(host, "Every guest has submitted a valid scorecard.");
  await button(host, "Lock submissions & open results").click();
  for (const page of guests) {
    await visible(page, "THE GUESSES ARE IN");
    assert.equal(await page.locator(".round-card").count(), 0);
    assert.equal(await page.locator(".guess-list > div").count(), 2);
    assert.equal(
      await page
        .locator('.guess-list .avatar-icon polyline[stroke="#8cc7df"]')
        .count(),
      1,
    );
    assert.equal(await page.locator(".wine-revealed").count(), 0);
    assert.equal(await page.locator(".average").count(), 0);
    assert.ok(
      !(await page.locator("body").innerText()).includes(
        "PRIVATE phone-only note",
      ),
    );
    assert.equal(await button(page, "Round 2").count(), 0);
  }
  const before = await snapshot(alice, id);
  assert.equal(before.results.length, 1);
  assert.equal(before.results[0].producer, undefined);
  assert.equal(before.results[0].wine, undefined);
  assert.equal(before.results[0].guesses[0].rating, undefined);
  assert.equal(before.results[0].guesses[0].correct, undefined);
  const denied = await alice.evaluate(
    async (id) =>
      (
        await fetch(`/api/events/${id}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reveal", revision: 0 }),
        })
      ).status,
    id,
  );
  assert.equal(denied, 401);
  const avatarDenied = await alice.evaluate(
    async (id) =>
      (
        await fetch(`/api/events/${id}/avatar`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatar: [] }),
        })
      ).status,
    id,
  );
  assert.equal(avatarDenied, 401);
  const avatarLocked = await alice.evaluate(
    async (id) =>
      (
        await fetch(`/api/events/${id}/avatar`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Guest-Token": localStorage.getItem("tasting.identity.v1")!,
          },
          body: JSON.stringify({ avatar: [] }),
        })
      ).status,
    id,
  );
  assert.equal(avatarLocked, 423);
  await button(host, "Reveal wine 1").click();
  for (const page of guests) {
    await revealed(page, 1);
    await visible(page, "St. Francis");
    assert.equal(await page.locator(".guess-list .correct").count(), 2);
    assert.equal(await page.locator(".average strong").innerText(), "7.0");
    await visible(page, "2 submitted ratings");
  }
  await button(host, "Show round 2 guesses").click();
  for (const page of guests) await roundShown(page, 2);
  await button(alice, "Round 1 ✓").click();
  await revealed(alice, 1);
  await button(host, "Reveal wine 2").click();
  await revealed(bob, 2);
  await revealed(alice, 1);
  await visible(alice, "Viewing round 1");
  assert.equal(await button(alice, "Round 3").count(), 0);
  const stage2 = await snapshot(bob, id);
  assert.equal(stage2.results.length, 2);
  assert.equal(JSON.stringify(stage2).includes("Kendall-Jackson"), false);
  await button(alice, "Follow host").click();
  await revealed(alice, 2);
  await button(host, "Show round 3 guesses").click();
  for (const page of guests) await roundShown(page, 3);
  await Promise.all([host.reload(), alice.reload(), bob.reload()]);
  await button(host, "Reveal wine 3").waitFor();
  for (const page of guests) {
    await roundShown(page, 3);
    assert.equal(await page.getByLabel("Your name").count(), 0);
    assert.equal(await page.locator(".wine-revealed").count(), 0);
  }
  // Simulate a disconnected phone while the host advances, then recover saved state.
  await contexts[2].unrouteAll({ behavior: "ignoreErrors" });
  await contexts[2].route(`${origin}/**`, (route) =>
    route.abort("internetdisconnected"),
  );
  await button(host, "Reveal wine 3").click();
  await revealed(alice, 3);
  await visible(bob, "Reconnecting");
  await contexts[2].unrouteAll({ behavior: "ignoreErrors" });
  if (relay)
    await contexts[2].route(`${origin}/**`, async (route) => {
      try {
        await route.fulfill({ response: await route.fetch() });
      } catch {
        try {
          await route.abort();
        } catch {}
      }
    });
  await bob.evaluate(() => window.dispatchEvent(new Event("online")));
  await revealed(bob, 3);
  for (let r = 4; r <= 8; r++) {
    await button(host, `Show round ${r} guesses`).click();
    for (const page of guests) {
      await roundShown(page, r);
      assert.equal(await page.locator(".wine-revealed").count(), 0);
    }
    await button(host, `Reveal wine ${r}`).click();
    for (const page of guests) await revealed(page, r);
  }
  await button(host, "Open final summary").click();
  mkdirSync("test-artifacts", { recursive: true });
  for (const [i, page] of guests.entries()) {
    await visible(page, "The leaderboard");
    assert.equal(await page.locator(".leader-row").count(), 2);
    assert.equal(
      await page
        .locator('.leader-row .avatar-icon polyline[stroke="#8cc7df"]')
        .count(),
      1,
    );
    assert.equal(await page.locator(".wine-row").count(), 8);
    assert.deepEqual(await page.locator(".rank").allTextContents(), ["1", "1"]);
    assert.ok(
      (await page.locator(".leader-row").first().innerText()).includes("8"),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: `test-artifacts/phone-only-final-${i}.png`,
      fullPage: true,
    });
    await button(page, "Round 1 ✓").click();
    await revealed(page, 1);
    await button(page, "Follow host").click();
    await visible(page, "The leaderboard");
    await page.reload();
    await visible(page, "The leaderboard");
  }
  await host.reload();
  await visible(host, "The leaderboard");
  assert.equal(
    displayRequests,
    0,
    "Entire event must work without opening a display",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        eventId: id,
        displayRequests,
        checks: [
          "host and two independent mobile guests",
          "automatic scorecard-to-results transition",
          "guesses before identity/ratings",
          "server reveal permission and future-answer secrecy",
          "automatic reveal synchronization",
          "browse previous rounds and Follow host",
          "partial-stage and final refresh recovery",
          "connection loss and recovery",
          "eight reveals without display",
          "final tie ranks and wine rankings",
          "390/412px mobile layouts",
          "notes remain private",
          "touch and mouse avatar drawing, Undo/Clear, colors, edit/save and refresh",
          "saved avatars on reveal and leaderboard",
          "avatar update permission",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(
    contexts.map((c) => c.unrouteAll({ behavior: "ignoreErrors" })),
  );
  await browser.close();
}
