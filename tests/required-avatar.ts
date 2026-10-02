import { approveSeatRecovery } from "./browser-helpers";
import { chromium, request } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const origin = process.env.TEST_URL || "http://127.0.0.1:3012";
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
const event = await (
  await api.post("/api/host/events", {
    data: { name: "Demo · required avatar check" },
  })
).json();
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
mkdirSync("test-artifacts/required-avatar", { recursive: true });
try {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const p = await c.newPage();
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${origin}/e/${event.id}`);
  await p.getByLabel("Your name").fill("Drawing guest");
  const join = p.getByRole("button", { name: "Take my seat", exact: true });
  assert.equal(await join.isDisabled(), false);
  await p.getByText("Add an avatar (optional)", { exact: true }).click();
  const canvas = p.getByRole("img", {
    name: "Avatar drawing area",
    exact: true,
  });
  await canvas.scrollIntoViewIfNeeded();
  let box = (await canvas.boundingBox())!;
  assert.ok(box.width >= 360);
  assert.ok(
    (await p
      .getByRole("button", { name: "Gold ink", exact: true })
      .evaluate((e) => e.getBoundingClientRect().height)) >= 56,
  );
  const scan = await new AxeBuilder({ page: p })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  await p.screenshot({
    path: "test-artifacts/required-avatar/join-phone.png",
    fullPage: true,
  });
  const session = await c.newCDPSession(p);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + 60, y: box.y + 80 }],
  });
  for (const dx of [80, 100, 120])
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: box.x + dx, y: box.y + dx }],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.equal(await join.isDisabled(), false);
  await p.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await join.isDisabled(), false);
  await canvas.focus();
  await p.keyboard.press("Space");
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Space");
  assert.equal(await join.isDisabled(), false);
  assert.equal(await canvas.locator("polyline").count(), 1);
  await p.getByRole("button", { name: "Clear drawing", exact: true }).click();
  assert.equal(await join.isDisabled(), false);
  await canvas.focus();
  await p.keyboard.press("Space");
  await p.keyboard.press("ArrowUp");
  await p.keyboard.press("Space");
  await p.setViewportSize({ width: 320, height: 720 });
  await p.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await p.screenshot({
    path: "test-artifacts/required-avatar/join-200-percent.png",
    fullPage: true,
  });
  await p.evaluate(() => (document.documentElement.style.fontSize = ""));
  await join.click();
  await p.getByText("A good night awaits.", { exact: true }).waitFor();
  await p.reload();
  await p
    .locator(".event-line .avatar-icon polyline")
    .waitFor({ state: "attached" });
  const rc = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const recovered = await rc.newPage();
  await recovered.goto(`${origin}/e/${event.id}`);
  await recovered
    .getByRole("button", { name: "Recover my seat", exact: true })
    .click();
  assert.equal(await recovered.locator(".drawing-surface").count(), 0);
  await approveSeatRecovery(recovered, api, origin, event.id, "Drawing guest");
  await recovered
    .locator(".event-line .avatar-icon polyline")
    .waitFor({ state: "attached" });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      optionalJoin: true,
      blankAndClearedAllowed: true,
      touchAndKeyboardDrawing: true,
      canvasWidth: box.width,
      toolHeightMinimum: 56,
      refreshAndRecovery: true,
      axeViolations: 0,
      narrowDoubleTextNoOverflow: true,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
  await api.dispose();
}
