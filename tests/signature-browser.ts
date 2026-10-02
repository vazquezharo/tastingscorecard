import { chromium } from "playwright";
import { expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { choices } from "../src/shared.ts";
const origin = process.env.TEST_URL || "http://127.0.0.1:3024";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const id = "b".repeat(32),
  path = `/api/events/${id}`;
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const hc = await browser.newContext({ viewport: { width: 1024, height: 768 } }),
  dc = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const gc1 = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }),
  gc2 = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  });
const host = await hc.newPage(),
  display = await dc.newPage(),
  phone1 = await gc1.newPage(),
  phone2 = await gc2.newPage();
const errors: string[] = [],
  displayMutations: string[] = [];
for (const p of [host, display, phone1, phone2])
  p.on("pageerror", (e) => errors.push(e.message));
display.on("request", (r) => {
  if (r.url().includes("/api/") && r.method() !== "GET")
    displayMutations.push(r.url());
});
await dc.route("https://images.example/**", (r) =>
  r.fulfill({ status: 404, body: "unavailable" }),
);
for (const c of [gc1, gc2])
  await c.route("https://images.example/**", (r) =>
    r.fulfill({ status: 404, body: "unavailable" }),
  );
mkdirSync("test-artifacts/signature", { recursive: true });
const get = async (host = false) =>
  await (
    await (host ? hc : dc).request.get(
      origin + path + (host ? "?host=1" : "?view=projector"),
    )
  ).json();
async function control(action: string, extra = {}) {
  const state = await get(true);
  const res = await hc.request.post(origin + path + "/control", {
    headers: { Origin: origin },
    data: { action, revision: state.controlRevision, ...extra },
  });
  assert.equal(res.status(), 200, await res.text());
}
try {
  await host.goto(origin + "/host");
  await host.getByLabel("Host password").fill("local-rehearsal-only");
  await host
    .getByRole("button", { name: "Open host controls", exact: true })
    .click();
  await host.goto(origin + `/host/e/${id}`);
  const tokens: string[] = [];
  // Two genuinely independent phone sessions, plus nine fictional table guests.
  for (let i = 0; i < 11; i++) {
    const token = crypto.randomUUID();
    tokens.push(token);
    const res = await dc.request.post(origin + path + "/join", {
      headers: { "X-Guest-Token": token },
      data: { name: `Guest ${String(i + 1).padStart(2, "0")}`, pin: "4826" },
    });
    assert.equal(res.status(), 200);
  }
  for (const [c, token] of [
    [gc1, tokens[0]],
    [gc2, tokens[1]],
  ] as const)
    await c.addInitScript(
      ({ token }) => localStorage.setItem("tasting.identity.v1", token),
      { token },
    );
  // Match actual browserToken key rather than assume storage naming.
  await Promise.all([
    phone1.goto(origin + `/e/${id}`),
    phone2.goto(origin + `/e/${id}`),
  ]);
  for (const [p, n] of [
    [phone1, "Guest 01"],
    [phone2, "Guest 02"],
  ] as const) {
    if (await p.getByText("Recover my seat", { exact: true }).count()) {
      await p.getByText("Recover my seat", { exact: true }).click();
      await p.getByLabel("Name used to join", { exact: true }).fill(n);
      await p.getByLabel("Recovery PIN", { exact: true }).fill("4826");
      await p
        .getByRole("button", { name: "Recover my scorecard", exact: true })
        .click();
    }
  }
  await control("key", { key: [...choices] });
  await control("start");
  for (let round = 1; round <= 8; round++) {
    if (round > 1) await control("unlock");
    for (let i = 0; i < 11; i++) {
      const res = await dc.request.put(origin + path + `/entries/${round}`, {
        headers: { "X-Guest-Token": tokens[i] },
        data: {
          guess: choices[(round - 1 + (i >= 2 ? i % 8 : 0)) % 8],
          rating: i === 0 ? 8.4 : i === 1 ? 8.2 : 6 + ((i + round) % 30) / 10,
          notes: `PRIVATE_NOTE_${i}`,
          revision: 0,
        },
      });
      assert.equal(res.status(), 200);
    }
  }
  for (const token of tokens)
    assert.equal(
      (
        await dc.request.post(origin + path + "/submit", {
          headers: { "X-Guest-Token": token },
          data: {},
        })
      ).status(),
      200,
    );
  const tasting = await get();
  assert.equal(tasting.parade, undefined);
  assert.equal(tasting.summary, undefined);
  assert.ok(!JSON.stringify(tasting).includes("Fictional exact bottle"));
  await control("lock");
  await Promise.all([
    phone1.reload(),
    phone2.reload(),
    display.goto(origin + `/projector/e/${id}`),
    host.reload(),
  ]);
  await expect(
    phone1.getByRole("heading", { name: "Final Scorecard", exact: true }),
  ).toBeVisible();
  await expect(
    phone2.getByRole("heading", { name: "Final Scorecard", exact: true }),
  ).toBeVisible();
  await expect(display.locator(".parade-card").first()).toBeVisible();
  assert.ok((await display.locator(".parade-card").count()) < 11);
  await display.reload();
  const stage = (await get()).revealStage;
  assert.ok(stage.startsAt < Date.now());
  await host.getByLabel("Three-second reveal countdown").check();
  await host
    .getByRole("button", { name: "Reveal wine 1", exact: true })
    .click();
  const pending = await get();
  assert.equal(pending.revealed, 0);
  assert.equal(pending.parade.guesses.length, 11);
  assert.ok(
    pending.parade.guesses.every(
      (g: any) => g.rating != null && g.correct === undefined,
    ),
  );
  assert.ok(!JSON.stringify(pending).includes("Fictional exact bottle"));
  assert.ok(!JSON.stringify(pending).includes("shop.example"));
  await expect(display.locator(".parade-card")).toHaveCount(11, {
    timeout: 15000,
  });
  assert.equal(await display.locator(".correct-mark").count(), 0);
  await expect(display.getByLabel("Round 1 reveal countdown")).toBeVisible();
  const countdown = (await get()).revealCountdown;
  await display.reload();
  assert.deepEqual((await get()).revealCountdown, countdown);
  await expect(
    display.getByText("Fictional exact bottle 1", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  for (let round = 1; round <= 8; round++) {
    if (round > 1) {
      await control("next");
      await control("reveal", { staged: true, countdown: round === 4 });
      await expect(
        display.getByText(`Fictional exact bottle ${round}`, { exact: true }),
      ).toBeVisible({ timeout: 18000 });
    }
    assert.equal((await get()).summary, undefined);
    assert.equal(await display.locator(".signature-final").count(), 0);
    assert.ok((await display.locator(".correct-mark").count()) > 0);
    if (round === 1) {
      await display.screenshot({
        path: "test-artifacts/signature/reveal-1280.png",
      });
      for (const viewport of [
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
      ]) {
        await display.setViewportSize(viewport);
        assert.equal(
          await display.evaluate(
            () =>
              document.documentElement.scrollHeight > innerHeight ||
              document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `Reveal overflow ${viewport.width}`,
        );
      }
      await display.reload();
      await expect(
        display.getByText("Fictional exact bottle 1", { exact: true }),
      ).toBeVisible();
      assert.equal(await display.locator(".parade-card").count(), 11);
      await expect(
        phone1
          .locator(".personal-round")
          .first()
          .getByRole("link", { name: "Find this bottle" }),
      ).toBeVisible();
      const link = phone1
        .locator(".personal-round")
        .first()
        .getByRole("link", { name: "Find this bottle" });
      assert.equal(
        await link.getAttribute("href"),
        "https://shop.example/fictional-bottle",
      );
      assert.equal(await link.getAttribute("target"), "_blank");
      assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
      await dc.setOffline(true);
      await display
        .getByText(/Connection interrupted/)
        .waitFor({ timeout: 20000 });
      assert.equal(await display.locator(".parade-card").count(), 11);
      await dc.setOffline(false);
    }
  }
  await expect(phone1.locator(".personal-answer")).toHaveCount(8);
  assert.equal(await phone1.locator(".bottle-link").count(), 1);
  assert.equal(
    await phone1.locator(".personal-answer .bottle-fallback").count(),
    8,
  );
  await expect(
    host.getByRole("button", { name: "Open final summary", exact: true }),
  ).toBeVisible();
  assert.equal((await get()).summary, undefined);
  await host
    .getByRole("button", { name: "Open final summary", exact: true })
    .click();
  await expect(
    display.getByText("TASTING CHAMPIONS", { exact: true }),
  ).toBeVisible();
  await expect(display.locator(".champion")).toHaveCount(3);
  await expect(display.locator(".final-wine-row")).toHaveCount(8);
  assert.match(
    await display.locator(".champion-panel").innerText(),
    /8 of 8 correct/,
  );
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await display.setViewportSize(viewport);
    assert.equal(
      await display.evaluate(
        () =>
          document.documentElement.scrollHeight > innerHeight ||
          document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `Summary overflow ${viewport.width}`,
    );
  }
  await display.screenshot({ path: "test-artifacts/signature/final-1920.png" });
  await display.reload();
  await expect(display.locator(".final-wine-row")).toHaveCount(8);
  await display.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await display
      .locator(".signature-final")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await phone1
    .getByRole("heading", { name: "Your taste, by the glass" })
    .waitFor();
  for (const p of [display, phone1]) {
    const scan = await new AxeBuilder({ page: p })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
    );
  }
  assert.deepEqual(displayMutations, []);
  assert.deepEqual(errors, []);
  assert.ok(
    !(await display.locator("body").innerText()).includes("PRIVATE_NOTE"),
  );
  console.log(
    JSON.stringify({
      passed: true,
      independentPhones: 2,
      guests: 11,
      rounds: 8,
      paradeRefresh: true,
      countdownRefresh: true,
      revealedRefresh: true,
      retailerLinks: true,
      imageFallbacks: true,
      displayMutations: 0,
      pageErrors: 0,
    }),
  );
} finally {
  await browser.close();
}
