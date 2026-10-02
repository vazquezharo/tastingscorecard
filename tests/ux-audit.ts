import { openOptionalAvatar } from "./browser-helpers";
import { chromium, type Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { choices } from "../src/shared.ts";
const origin = process.env.TEST_URL || "http://127.0.0.1:3010";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(origin).hostname),
  "Audit must never mutate production",
);
const mode = process.env.AUDIT_MODE || "before";
const folder = `docs/ux-audit/${mode}`;
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const hc = await browser.newContext({ viewport: { width: 1280, height: 900 } }),
  gc = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }),
  oc = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }),
  pc = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    reducedMotion: "reduce",
  });
const host = await hc.newPage(),
  guest = await gc.newPage(),
  other = await oc.newPage(),
  display = await pc.newPage();
const report: {
  screens: unknown[];
  errors: string[];
  observations: Record<string, unknown>;
} = { screens: [], errors: [], observations: {} };
for (const p of [host, guest, other, display])
  p.on("pageerror", (e) => report.errors.push(e.message));
const button = (p: Page, n: string) =>
  p.getByRole("button", { name: n, exact: true });
const visible = async (p: Page, t: string) =>
  p
    .getByText(t, { exact: false })
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 15000 });
const saved = async () =>
  guest
    .locator(".round-card:not([hidden]) .save-state.confirmed")
    .waitFor({ timeout: 15000 });
async function capture(p: Page, name: string, axe = true) {
  await p.evaluate(() => scrollTo(0, 0));
  await p.screenshot({ path: `${folder}/${name}.png`, fullPage: true });
  const scan = axe
    ? await new AxeBuilder({ page: p })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    : null;
  report.screens.push({
    name,
    overflow: await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    violations: scan?.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  });
}
try {
  await host.goto(origin + "/host");
  await host.getByLabel("Host password").fill(process.env.HOST_PASSWORD!);
  await button(host, "Open host controls").click();
  await capture(host, "host-empty");
  await host.getByLabel("Name your evening").fill(`Demo · UX audit ${mode}`);
  await button(host, "Create event").click();
  await host.waitForURL(/\/host\/e\//);
  const id = host.url().split("/").at(-1)!;
  report.observations.eventId = id;
  await host.getByLabel("Answer for round 1", { exact: true }).waitFor();
  await capture(host, "host-setup-desktop");
  await host.setViewportSize({ width: 390, height: 844 });
  await capture(host, "host-setup-phone");
  await host.setViewportSize({ width: 1280, height: 900 });
  await guest.goto(`${origin}/e/${id}`);
  await capture(guest, "join-phone");
  await button(guest, "Recover my seat").click();
  await capture(guest, "recover-phone");
  await button(guest, "New guest").click();
  await guest.getByLabel("Your name").fill("Alex");
  await guest.getByLabel("Create a recovery PIN", { exact: true }).fill("4826");
  await openOptionalAvatar(guest);
  await guest.locator(".drawing-surface").click();
  await button(guest, "Take my seat").click();
  await visible(guest, "A good night awaits.");
  await capture(guest, "waiting-phone");
  await other.goto(`${origin}/e/${id}`);
  await other.getByLabel("Your name").fill("Alex");
  await other.getByLabel("Create a recovery PIN", { exact: true }).fill("5731");
  await openOptionalAvatar(other);
  await other.locator(".drawing-surface").click();
  await button(other, "Take my seat").click();
  await visible(other, "That name is already in use");
  await capture(other, "duplicate-name-error");
  await other.getByLabel("Your name").fill("Blair");
  await openOptionalAvatar(other);
  await other.locator(".drawing-surface").click();
  await button(other, "Take my seat").click();
  await visible(other, "A good night awaits.");
  for (let r = 1; r <= 8; r++)
    await host
      .getByLabel(`Answer for round ${r}`, { exact: true })
      .selectOption(choices[r - 1]);
  await button(host, "Save answer key").click();
  await button(host, "Start round 1").click();
  await guest.locator("#guess-1").waitFor();
  report.observations.blankSaveState = await guest
    .locator(".round-card:not([hidden]) .save-state")
    .innerText();
  await capture(guest, "blank-round-phone");
  if (mode !== "before") {
    assert.equal(await guest.locator("#rating-1").inputValue(), "");
    await button(guest, "1.0").click();
    await saved();
    await button(guest, "Increase rating").click();
    await saved();
    assert.equal(Number(await guest.locator("#rating-1").inputValue()), 1.1);
    await button(guest, "10.0").click();
    await saved();
    assert.equal(await button(guest, "Increase rating").isDisabled(), true);
    await button(guest, "Clear rating").click();
    await saved();
    assert.equal(await guest.locator("#rating-1").inputValue(), "");
    await guest.locator("#rating-1").pressSequentially("8.3");
    await saved();
    assert.equal(Number(await guest.locator("#rating-1").inputValue()), 8.3);
  }
  if (mode !== "before")
    assert.ok(
      String(report.observations.blankSaveState).includes("No entry yet"),
    );
  await guest.locator("#guess-1").selectOption(choices[0]);
  await button(guest, "7.0").click();
  await saved();
  // Failed saves and a server-side edit create a real revision conflict.
  const token = await guest.evaluate(() =>
    localStorage.getItem("tasting.identity.v1")!,
  );
  await gc.setOffline(true);
  await guest.locator("#notes-1").fill("My unsaved draft must survive.");
  await visible(guest, "Not saved");
  await capture(guest, "disconnected-phone", false);
  const state = await (
    await hc.request.get(`${origin}/api/events/${id}`, {
      headers: { "X-Guest-Token": token },
    })
  ).json();
  const changed = await hc.request.put(`${origin}/api/events/${id}/entries/1`, {
    headers: { "X-Guest-Token": token },
    data: {
      ...state.me.entries[1],
      notes: "Saved from another device",
      revision: state.me.entries[1].revision,
    },
  });
  assert.equal(changed.status(), 200);
  await gc.setOffline(false);
  await guest.evaluate(() => window.dispatchEvent(new Event("online")));
  await visible(guest, "Not saved");
  await visible(guest, "draft");
  if (mode === "before")
    await button(guest, "Discard this draft and load saved version").waitFor();
  else await button(guest, "Keep my draft and save").waitFor();
  await capture(guest, "conflict-phone");
  assert.equal(
    await guest.locator("#notes-1").inputValue(),
    "My unsaved draft must survive.",
  );
  if (mode === "before")
    await button(guest, "Discard this draft and load saved version").click();
  else {
    guest.once("dialog", (d) => d.accept());
    await button(guest, "Keep my draft and save").click();
    await saved();
    assert.equal(
      await guest.locator("#notes-1").inputValue(),
      "My unsaved draft must survive.",
    );
  }
  for (let r = 2; r <= 8; r++) {
    await button(host, `Open round ${r}`).click();
    await guest.locator(`#guess-${r}`).waitFor();
    await guest
      .locator(`#guess-${r}`)
      .selectOption(r === 2 ? choices[0] : choices[r - 1]);
    await button(guest, "7.0").last().click();
    await saved();
    if (r === 2) {
      await capture(guest, "duplicate-round-phone");
      await guest.locator("#guess-2").selectOption(choices[1]);
      await saved();
    }
  }
  await guest.locator(".round-nav button").first().click();
  await capture(guest, "earlier-round-phone");
  if (mode !== "before") {
    assert.ok(
      (await guest.locator(".score-title").innerText()).includes("Round 1"),
    );
    await button(guest, "Go to current round 8").click();
    assert.equal(
      await guest
        .locator(".round-card:not([hidden]) select")
        .getAttribute("id"),
      "guess-8",
    );
    await guest.locator(".round-nav button").first().click();
  }
  await button(guest, "Review scorecard").click();
  await button(guest, "Submit scorecard").click();
  await visible(guest, "Scorecard submitted");
  await guest.locator("#guess-1").selectOption(choices[1]);
  await saved();
  await capture(guest, "submitted-to-draft-phone");
  if (mode !== "before")
    await visible(guest, "Your edited scorecard is now a draft");
  await guest.locator("#guess-1").selectOption(choices[0]);
  await saved();
  await button(guest, "Submit scorecard").click();
  await visible(guest, "Scorecard submitted");
  await visible(host, "Blair:");
  await capture(host, "host-incomplete-desktop");
  await host.setViewportSize({ width: 390, height: 844 });
  await capture(host, "host-incomplete-phone");
  await host.setViewportSize({ width: 1280, height: 900 });
  await host.getByLabel("Lock anyway.", { exact: false }).check();
  await button(host, "Lock submissions & open results").click();
  await visible(guest, "THE GUESSES ARE IN");
  await capture(guest, "locked-guesses-phone");
  await display.goto(`${origin}/projector/e/${id}`);
  for (let r = 1; r <= 8; r++) {
    await button(host, `Reveal wine ${r}`).click();
    await guest
      .locator(".wine-revealed h1")
      .filter({ hasText: choices[r - 1] })
      .waitFor();
    if (r === 1) {
      await capture(guest, "revealed-phone");
      await display.locator(".wine-revealed h1").waitFor();
      await capture(display, "revealed-display");
    }
    if (r < 8) {
      await button(host, `Show round ${r + 1} guesses`).click();
      await visible(guest, `ROUND 0${r + 1}`);
    }
  }
  await button(host, "Open final summary").click();
  await visible(guest, "The leaderboard");
  await capture(guest, "summary-phone");
  await capture(host, "summary-host-desktop");
  await button(guest, "Round 1 ✓").click();
  await capture(guest, "browsing-phone");
  if (mode !== "before") {
    await guest.evaluate(() =>
      scrollTo(0, document.documentElement.scrollHeight),
    );
    const box = await button(guest, "Follow host").boundingBox();
    assert.ok(
      box && box.y >= 0 && box.y + box.height <= 844,
      "Follow host must remain on-screen while browsing",
    );
  }
  await button(guest, "Follow host").click();
  await visible(guest, "The leaderboard");
  await guest.setViewportSize({ width: 320, height: 720 });
  await capture(guest, "summary-320px");
  await guest.evaluate(
    () => (document.documentElement.style.fontSize = "200%"),
  );
  await capture(guest, "summary-text-200-percent");
  await guest.evaluate(() => (document.documentElement.style.fontSize = ""));
  assert.deepEqual(report.errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      mode,
      eventId: id,
      screens: report.screens.length,
      report: `${folder}/report.json`,
    }),
  );
} finally {
  writeFileSync(`${folder}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
