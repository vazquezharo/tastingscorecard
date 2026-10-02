import { approveSeatRecovery } from "./browser-helpers";
import { chromium, type Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { choices } from "../src/shared.ts";
import { producers } from "../server/wines.ts";
const origin = process.env.TEST_URL || "http://127.0.0.1:3020";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const hostContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const guestContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const recoveredContext = await browser.newContext({
  viewport: { width: 412, height: 915 },
  isMobile: true,
  hasTouch: true,
});
const displayContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
});
const assistedContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const [host, guest, recovered, display, assist] = await Promise.all([
  hostContext.newPage(),
  guestContext.newPage(),
  recoveredContext.newPage(),
  displayContext.newPage(),
  assistedContext.newPage(),
]);
const publicPayloads: Promise<any>[] = [];
for (const page of [guest, recovered, display])
  page.on("response", (response) => {
    if (response.url().includes("/api/"))
      publicPayloads.push(response.json().catch(() => undefined));
  });
const errors: string[] = [];
for (const page of [host, guest, recovered, display, assist])
  page.on("pageerror", (e) => errors.push(e.message));
mkdirSync("test-artifacts/phase-one", { recursive: true });
const visible = async (page: Page, text: string) =>
  page
    .getByText(text, { exact: false })
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 15000 });
const saved = async () =>
  guest.locator(".round-card:not([hidden]) .save-state.confirmed").waitFor();
async function mobileChecks(page: Page) {
  for (const width of [320, 375, 390, 412]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `Overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Overflow at 200% text",
  );
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await page.setViewportSize({ width: 390, height: 844 });
}
try {
  await hostContext.request.post(origin + "/api/host/login", {
    data: { password: process.env.TEST_PASSWORD || "local-rehearsal-only" },
  });
  const created = await hostContext.request.post(origin + "/api/host/events", {
    data: { name: "Demo · phase-one reliability rehearsal" },
  });
  const event = await created.json();
  const path = `/api/events/${event.id}`;
  await assistedContext.addCookies(await hostContext.cookies());
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
  await control("wines", {
    wines: choices.map((type, i) => ({ type, producer: `SECRET_BOTTLE_${i}` })),
  });
  await control("key", { key: [...choices].reverse() });
  await host.goto(origin + `/host/e/${event.id}`);
  await guest.goto(origin + `/e/${event.id}`);
  await guest.getByLabel("Your name").fill("Riley Torres");
  assert.equal(
    await guest
      .getByRole("button", { name: "Take my seat", exact: true })
      .isDisabled(),
    false,
  );
  assert.equal(
    await guest
      .locator(".join-avatar")
      .evaluate((el) => (el as HTMLDetailsElement).open),
    false,
  );
  assert.equal(
    await guest.locator(".initials-preview .avatar-icon").innerText(),
    "RT",
  );
  await mobileChecks(guest);
  await guest
    .getByRole("button", { name: "Take my seat", exact: true })
    .click();
  await visible(guest, "A good night awaits.");
  assert.equal(
    await guest.locator(".event-line .avatar-icon").innerText(),
    "RT",
  );
  await guest.reload();
  await visible(guest, "A good night awaits.");
  const secondToken = randomUUID();
  const joined = await recoveredContext.request.post(origin + path + "/join", {
    headers: { "X-Guest-Token": secondToken },
    data: { name: "Morgan Reed" },
  });
  const second = (await joined.json()).me;
  await recovered.goto(origin + `/e/${event.id}`);
  await recovered
    .getByRole("button", { name: "Recover my seat", exact: true })
    .click();
  await approveSeatRecovery(
    recovered,
    hostContext.request,
    origin,
    event.id,
    "Riley Torres",
  );
  await visible(recovered, "A good night awaits.");
  const assistedRequests: string[] = [];
  const assistedPayloads: any[] = [];
  assist.on("request", (request) => {
    if (request.url().includes("/api/")) assistedRequests.push(request.url());
  });
  assist.on("response", async (response) => {
    if (response.url().includes("/api/")) {
      try {
        assistedPayloads.push(await response.json());
      } catch {}
    }
  });
  await assist.goto(origin + `/host/assist/e/${event.id}?guest=${second.id}`);
  await assist
    .getByRole("heading", { name: "Morgan Reed’s scorecard" })
    .waitFor();
  await control("start");
  await guest.locator("#guess-1").waitFor();
  await guest.locator("#guess-1").selectOption(choices[0]);
  await guest.getByRole("button", { name: "7.0", exact: true }).last().click();
  await guest.getByLabel("Tasting notes").fill("PRIVATE_NOTE_ON_PHONE");
  await saved();
  await mobileChecks(guest);
  for (const page of [guest, recovered, assist]) {
    assert.ok(
      !(await page.locator("html").innerHTML()).includes("SECRET_BOTTLE"),
      "Hidden DOM must not contain private producers",
    );
    assert.equal(
      await page.locator('link[rel="preload"][as="image"]').count(),
      0,
    );
  }
  const initialHtml = await (
    await guestContext.request.get(origin + `/e/${event.id}`)
  ).text();
  assert.ok(!initialHtml.includes("SECRET_BOTTLE"));
  assert.ok(!initialHtml.includes('"key":'));
  for (const selector of [
    ".round-nav button",
    ".rating-control button",
    ".rating-presets button",
    ".return-current",
  ]) {
    const targets = guest.locator(selector);
    for (let i = 0; i < (await targets.count()); i++) {
      if (await targets.nth(i).isVisible()) {
        const box = await targets.nth(i).boundingBox();
        assert.ok(box!.width >= 44 && box!.height >= 44, selector);
      }
    }
  }
  // Save failure retains the guest draft; retry and recovered browsers receive confirmed data.
  await guestContext.setOffline(true);
  await guest.getByLabel("Tasting notes").fill("PRIVATE_NOTE_RETRIED");
  await visible(guest, "Not saved");
  await guestContext.setOffline(false);
  await saved();
  await recovered.waitForFunction(
    () =>
      document.querySelector<HTMLTextAreaElement>("#notes-1")?.value ===
      "PRIVATE_NOTE_RETRIED",
  );
  // Assisted editing on the same guest rejects concurrent changes and preserves notes.
  const mine = await guest.evaluate(
    async (id) =>
      (
        await fetch(`/api/events/${id}`, {
          headers: {
            "X-Guest-Token": localStorage.getItem("tasting.identity.v1")!,
          },
        })
      ).json(),
    event.id,
  );
  await assist.getByLabel("Registered guest").selectOption(mine.me.id);
  await assist.locator("#assist-guess-1").waitFor();
  await assist.locator("#assist-guess-1").selectOption(choices[1]);
  await guest.getByLabel("Tasting notes").fill("PRIVATE_NOTE_PRESERVED");
  await saved();
  await visible(assist, "Another device saved this round.");
  assert.equal(
    await assist
      .getByRole("button", { name: "Save round 1", exact: true })
      .isDisabled(),
    true,
  );
  assist.once("dialog", (dialog) => dialog.accept());
  await assist
    .getByRole("button", { name: "Load latest saved answers" })
    .click();
  await assist.getByLabel("Registered guest").selectOption(second.id);
  for (let round = 1; round <= 8; round++) {
    if (round > 1) {
      await control("unlock");
      await guest.locator(`#guess-${round}`).waitFor();
      await guest.locator(`#guess-${round}`).selectOption(choices[round - 1]);
      await guest
        .getByRole("button", { name: "7.0", exact: true })
        .last()
        .click();
      await saved();
    }
    const row = assist.getByLabel(`Assist round ${round}`, { exact: true });
    await row.waitFor();
    await row.locator("select").selectOption(choices[round - 1]);
    await row.locator('input[type="number"]').fill("6.8");
    if (round === 1) {
      await assistedContext.setOffline(true);
      await row
        .getByRole("button", { name: "Save round 1", exact: true })
        .click();
      await visible(assist, "Save failed");
      await assistedContext.setOffline(false);
      await assist
        .getByRole("button", { name: "Refresh saved scorecards" })
        .click();
    }
    await row
      .getByRole("button", {
        name: round === 1 ? "Retry save round 1" : `Save round ${round}`,
        exact: true,
      })
      .click();
    await row.getByText("Saved · Entered by host", { exact: true }).waitFor();
  }
  await guest.locator(".round-nav button").first().click();
  await guest.locator("#rating-1").fill("7.2");
  await saved();
  await guest
    .getByRole("button", { name: "Review scorecard", exact: true })
    .click();
  await guest
    .getByRole("button", { name: "Submit scorecard", exact: true })
    .click();
  await visible(guest, "Scorecard submitted");
  assist.once("dialog", (dialog) => dialog.accept());
  await assist
    .getByRole("button", {
      name: "Submit Morgan Reed’s scorecard",
      exact: true,
    })
    .click();
  await visible(assist, "Scorecard submitted");
  await assist.reload();
  await assist.getByLabel("Registered guest").selectOption(second.id);
  await visible(assist, "Submitted · valid edits");
  for (const page of [guest, assist]) {
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      scan.violations.map((v) => v.id),
      [],
    );
  }
  await control("lock");
  await Promise.all([
    guest
      .getByRole("heading", { name: "Final Scorecard", exact: true })
      .waitFor(),
    recovered
      .getByRole("heading", { name: "Final Scorecard", exact: true })
      .waitFor(),
  ]);
  await visible(assist, "Submissions locked.");
  assert.equal(await guest.locator(".personal-round").count(), 8);
  assert.equal(await guest.locator(".personal-answer").count(), 0);
  assert.equal(
    await guest
      .locator(".reveal-card,.average,.leader-row,.reveal-countdown")
      .count(),
    0,
  );
  assert.equal(
    await assist
      .getByRole("button", { name: "Save round 1", exact: true })
      .isDisabled(),
    true,
  );
  await guest.getByText("My private note", { exact: true }).click();
  await visible(guest, "PRIVATE_NOTE_PRESERVED");
  await mobileChecks(guest);
  await guest.screenshot({
    path: "test-artifacts/phase-one/final-scorecard-mobile.png",
    fullPage: true,
  });
  await display.goto(origin + `/projector/e/${event.id}`);
  await control("reveal", { countdown: true });
  await display.getByLabel("Round 1 reveal countdown").waitFor();
  assert.equal(await guest.locator(".personal-answer").count(), 0);
  await guest
    .locator(".personal-round:nth-child(1) .personal-answer")
    .waitFor();
  assert.equal(await guest.locator(".personal-answer").count(), 1);
  for (let round = 2; round <= 8; round++) {
    await control("next");
    await control("reveal");
    await guest
      .locator(`.personal-round:nth-child(${round}) .personal-answer`)
      .waitFor();
    assert.equal(await guest.locator(".personal-answer").count(), round);
  }
  await control("summary");
  await guest
    .getByRole("heading", { name: "Your taste, by the glass" })
    .waitFor();
  await guest
    .getByText("Final rankings & evening recap", { exact: true })
    .click();
  await guest
    .getByRole("button", { name: "Preview evening recap", exact: true })
    .click();
  await guest.getByRole("link", { name: "Download recap PNG" }).waitFor();
  await recovered.reload();
  await recovered
    .getByRole("heading", { name: "Final Scorecard", exact: true })
    .waitFor();
  assert.equal(await recovered.locator(".personal-answer").count(), 8);
  await guest.getByRole("link", { name: "Download recap PNG" }).waitFor();
  const finalScan = await new AxeBuilder({ page: guest })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    finalScan.violations.map((v) => v.id),
    [],
  );
  assert.ok(assistedRequests.length > 5);
  assert.ok(
    assistedRequests.every((url) => url.includes("/assisted")),
    JSON.stringify(assistedRequests),
  );
  for (const payload of assistedPayloads) {
    const text = JSON.stringify(payload);
    assert.ok(!text.includes("SECRET_BOTTLE"));
    assert.ok(!text.includes("PRIVATE_NOTE"));
    for (const field of [
      "key",
      "wines",
      "bottlePhotos",
      "results",
      "summary",
      "roster",
    ])
      assert.equal(payload[field], undefined);
  }
  for (const page of [guest, recovered, assist, display]) {
    const stored = await page.evaluate(() =>
      JSON.stringify({
        local: Object.fromEntries(Object.entries(localStorage)),
        session: Object.fromEntries(Object.entries(sessionStorage)),
      }),
    );
    assert.ok(!stored.includes("SECRET_BOTTLE"));
    assert.ok(!stored.includes('"key"'));
  }
  for (const payload of await Promise.all(publicPayloads)) {
    if (!payload || !Array.isArray(payload.results)) continue;
    for (const field of [
      "key",
      "wines",
      "roster",
      "bottlePhotos",
      "keyCorrections",
    ])
      assert.equal(payload[field], undefined);
    if (payload.revealed < 8) assert.equal(payload.summary, undefined);
    for (const result of payload.results)
      if (result.round > payload.revealed) {
        for (const field of [
          "wine",
          "producer",
          "bottlePhoto",
          "average",
          "count",
        ])
          assert.equal(result[field], undefined);
        assert.ok(
          result.guesses.every(
            (guess: any) =>
              guess.correct === undefined && guess.rating === undefined,
          ),
        );
      }
  }
  const bundles = readdirSync("dist/assets")
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync("dist/assets/" + file, "utf8"))
    .join("\n");
  for (const producer of Object.values(producers))
    assert.ok(!bundles.includes(JSON.stringify(producer)), producer);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      event: event.id,
      checks: [
        "optional initials join",
        "refresh and host-approved recovery",
        "320/375/390/412px and 200% text",
        "44px touch targets",
        "guest autosave offline retry",
        "assisted offline retry and conflict",
        "isolated assisted API and DOM",
        "eight guest and assisted rounds",
        "valid final submissions",
        "normal lock enforcement",
        "private saved notes",
        "progressive personal answers",
        "existing display/countdown",
        "insights and recap",
        "bundle/storage secrecy",
        "zero axe/page errors",
      ],
    }),
  );
} finally {
  await browser.close();
}
