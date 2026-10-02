import { openOptionalAvatar } from "./browser-helpers";
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
const hostContext = await browser.newContext({
    ...proxyOptions,
    viewport: { width: 1280, height: 900 },
  }),
  guestContext = await browser.newContext({
    ...proxyOptions,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }),
  projectorContext = await browser.newContext({
    ...proxyOptions,
    viewport: { width: 1920, height: 1080 },
  }),
  otherContext = await browser.newContext({
    ...proxyOptions,
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  });
// Optional test transport for managed environments whose proxy CA is trusted by
// Node but not Chromium. TLS verification stays enabled; browser trust is unchanged.
if (relay) {
  for (const context of [
    hostContext,
    guestContext,
    projectorContext,
    otherContext,
  ]) {
    let offline = false;
    const setOffline = context.setOffline.bind(context);
    context.setOffline = async (value: boolean) => {
      offline = value;
      await setOffline(value);
    };
    await context.route(`${origin}/**`, async (route) => {
      if (offline) {
        await route.abort("internetdisconnected");
        return;
      }
      try {
        const response = await route.fetch();
        await route.fulfill({ response });
      } catch {
        try {
          await route.abort("failed");
        } catch {
          /* browser closing */
        }
      }
    });
  }
}
const host = await hostContext.newPage(),
  guest = await guestContext.newPage(),
  projector = await projectorContext.newPage(),
  other = await otherContext.newPage();
const errors: string[] = [];
for (const p of [host, guest, projector, other])
  p.on("pageerror", (e) => errors.push(e.message));
mkdirSync("test-artifacts", { recursive: true });
const waitText = async (page: Page, text: string) => {
  await page
    .getByText(text, { exact: false })
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 15000 });
};
const saved = async () => {
  await guest
    .locator(".round-card:not([hidden]) .save-state.confirmed")
    .waitFor({ timeout: 15000 });
};
const noOverflow = async (page: Page) =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "horizontal overflow",
  );
try {
  await host.goto(origin + "/host");
  await host
    .getByLabel("Host password")
    .fill(
      process.env.TEST_PASSWORD ||
        process.env.HOST_PASSWORD ||
        "local-rehearsal-only",
    );
  await host
    .getByRole("button", { name: "Open host controls", exact: true })
    .click();
  await host.getByLabel("Name your evening").fill("Demo · browser rehearsal");
  await host.getByRole("button", { name: "Create event", exact: true }).click();
  await host.waitForURL(/\/host\/e\//);
  const id = host.url().split("/").at(-1)!;
  await guest.goto(`${origin}/e/${id}`);
  await guest.getByLabel("Your name").fill("Harold");
  await guest.getByLabel("Create a recovery PIN").fill("4826");
  await openOptionalAvatar(guest);
  await guest.locator(".drawing-surface").click();
  await guest.getByRole("button", { name: "Take my seat" }).click();
  await waitText(guest, "A good night awaits.");
  await guest.reload();
  await waitText(guest, "Harold");
  assert.equal(
    await guest.getByLabel("Your name").count(),
    0,
    "refresh should recover identity",
  );
  await other.goto(`${origin}/e/${id}`);
  await other.getByLabel("Your name").fill("Harold");
  await other.getByLabel("Create a recovery PIN").fill("5731");
  await openOptionalAvatar(other);
  await other.locator(".drawing-surface").click();
  await other.getByRole("button", { name: "Take my seat" }).click();
  await waitText(other, "That name is already in use");
  await other.getByLabel("Your name").fill("Casey");
  await other.getByLabel("Create a recovery PIN").fill("5731");
  await openOptionalAvatar(other);
  await other.locator(".drawing-surface").click();
  await other.getByRole("button", { name: "Take my seat" }).click();
  await waitText(other, "Casey");
  await projector.goto(`${origin}/projector/e/${id}`);
  await waitText(projector, "Take your");
  const key = [
    choices[5],
    choices[1],
    choices[7],
    choices[0],
    choices[4],
    choices[6],
    choices[3],
    choices[2],
  ];
  for (let r = 1; r <= 8; r++)
    await host
      .getByLabel(`Answer for round ${r}`, { exact: true })
      .selectOption(key[r - 1]);
  await host.getByRole("button", { name: "Save answer key" }).click();
  await host
    .getByRole("button", { name: "Start round 1" })
    .waitFor({ state: "visible" });
  await host.waitForFunction(
    () =>
      !(
        Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent === "Start round 1",
        ) as HTMLButtonElement
      )?.disabled,
  );
  await host.getByRole("button", { name: "Start round 1" }).click();
  await guest.getByLabel("Your wine-type guess").first().waitFor();
  await waitText(projector, "Round 1");
  assert.equal(await guest.locator(".round-nav button").count(), 1);
  assert.ok(
    !(await projector.locator("body").innerText()).includes("Tempranillo"),
  );
  assert.ok(
    !(await projector.locator("body").innerText()).includes("La Enfermera"),
  );
  const blocked = await guest.evaluate(async (id) => {
    const r = await fetch(`/api/events/${id}/entries/2`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Guest-Token": localStorage.getItem("tasting.identity.v1")!,
      },
      body: JSON.stringify({
        guess: "Merlot",
        rating: 7,
        notes: "",
        revision: 0,
      }),
    });
    return r.status;
  }, id);
  assert.equal(blocked, 403);
  await guest.getByLabel("Your wine-type guess").first().selectOption(key[0]);
  await guest.getByRole("button", { name: "7.0", exact: true }).click();
  await guest
    .getByLabel("Tasting notes")
    .first()
    .fill("Dark fruit, silky finish.");
  await saved();
  await guest.screenshot({
    path: "test-artifacts/guest-mobile.png",
    fullPage: true,
  });
  await noOverflow(guest);
  await guest.reload();
  await guest.getByLabel("Tasting notes").first().waitFor();
  assert.equal(
    await guest.getByLabel("Tasting notes").first().inputValue(),
    "Dark fruit, silky finish.",
  );
  await projector.screenshot({
    path: "test-artifacts/projector-tasting.png",
    fullPage: true,
  });
  await guestContext.setOffline(true);
  await guest
    .getByLabel("Tasting notes")
    .first()
    .fill("Offline note retained.");
  await waitText(guest, "Not saved");
  assert.ok(
    (await guest.locator(".save-state").first().innerText()).includes(
      "Not saved",
    ),
  );
  await guestContext.setOffline(false);
  await saved();
  assert.equal(
    await guest.getByLabel("Tasting notes").first().inputValue(),
    "Offline note retained.",
  );
  // A second tab shares identity but uses revisions to prevent silent lost edits.
  const tab = await guestContext.newPage();
  await tab.goto(`${origin}/e/${id}`);
  await tab.getByLabel("Tasting notes").first().waitFor();
  await tab.getByLabel("Tasting notes").first().fill("Edited in another tab.");
  await tab.locator(".save-state.confirmed").first().waitFor();
  await tab.close();
  await guest.waitForFunction(
    () =>
      document.querySelector("textarea")?.value === "Edited in another tab.",
    { timeout: 10000 },
  );
  for (let r = 2; r <= 8; r++) {
    await host
      .getByRole("button", { name: `Open round ${r}`, exact: true })
      .click();
    await guest.locator(`#guess-${r}`).waitFor();
    await waitText(projector, `Round ${r}`);
    await guest
      .locator(`#guess-${r}`)
      .selectOption(r === 2 ? key[0] : key[r - 1]);
    await guest
      .getByRole("button", { name: "7.0", exact: true })
      .last()
      .click();
    await saved();
    if (r === 2) {
      await waitText(guest, "Repeated wine type in rounds 1 & 2");
      await guest.locator("#guess-2").selectOption(key[1]);
      await saved();
    }
  }
  await guest.locator(".round-nav button").first().click();
  await guest.locator("#notes-1").fill("Earlier round, still editable.");
  await saved();
  await guest
    .getByRole("button", { name: "Review scorecard", exact: true })
    .click();
  await guest
    .getByRole("button", { name: "Submit scorecard", exact: true })
    .click();
  await waitText(guest, "Scorecard submitted");
  // Editing a final submission to an invalid card clears submitted status.
  await guest.locator("#guess-1").selectOption(key[1]);
  await saved();
  await waitText(guest, "Repeated wine type in rounds 1 & 2");
  assert.equal(
    await guest
      .getByRole("button", { name: "Submit scorecard", exact: true })
      .isDisabled(),
    true,
  );
  await guest.locator("#guess-1").selectOption(key[0]);
  await saved();
  await guest
    .getByRole("button", { name: "Submit scorecard", exact: true })
    .click();
  await waitText(guest, "Scorecard submitted");
  await waitText(host, "Casey:");
  await host.getByLabel("Lock anyway.", { exact: false }).check();
  await host
    .getByRole("button", { name: "Lock submissions & open results" })
    .click();
  await waitText(projector, "THE GUESSES ARE IN");
  await waitText(guest, "Final Scorecard");
  assert.equal(await guest.locator("#guess-1").count(), 0);
  assert.ok(
    !(await projector.locator("body").innerText()).includes("La Enfermera"),
  );
  assert.ok(
    !(await projector.locator("body").innerText()).includes(
      "Earlier round, still editable.",
    ),
  );
  for (let r = 1; r <= 8; r++) {
    await host
      .getByRole("button", { name: `Reveal wine ${r}`, exact: true })
      .click();
    await projector
      .locator(".wine-revealed h1")
      .filter({ hasText: key[r - 1] })
      .waitFor();
    await guest
      .locator(`.personal-round:nth-child(${r}) .personal-answer strong`)
      .filter({ hasText: key[r - 1] })
      .waitFor();
    if (r === 1) {
      await projector.evaluate(() =>
        Promise.all(document.getAnimations().map((a) => a.finished)),
      );
      await projector.screenshot({
        path: "test-artifacts/projector-reveal.png",
        fullPage: true,
      });
    }
    if (r < 8) {
      await host
        .getByRole("button", {
          name: `Show round ${r + 1} guesses`,
          exact: true,
        })
        .click();
      await waitText(projector, `ROUND 0${r + 1}`);
    }
  }
  await host.getByRole("button", { name: "Open final summary" }).click();
  await waitText(projector, "The leaderboard");
  await guest
    .getByText("Final rankings & evening recap", { exact: true })
    .click();
  await waitText(guest, "The leaderboard");
  assert.ok(
    (await projector.locator(".leader-row").first().innerText()).includes("8"),
  );
  assert.ok(
    (await projector.locator("body").innerText()).includes(
      "Incomplete scorecard",
    ),
  );
  await noOverflow(guest);
  await noOverflow(other);
  await noOverflow(projector);
  await guest.evaluate(
    () => (document.documentElement.style.fontSize = "200%"),
  );
  await noOverflow(guest);
  await guest.evaluate(() => (document.documentElement.style.fontSize = ""));
  const downloadPromise = host.waitForEvent("download");
  await host.getByRole("link", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  await download.saveAs("test-artifacts/results.csv");
  await projector.reload();
  await waitText(projector, "The leaderboard");
  await projector.screenshot({
    path: "test-artifacts/projector-summary.png",
    fullPage: true,
  });
  await guest.screenshot({
    path: "test-artifacts/guest-results-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        eventId: id,
        checks: [
          "separate host/guest/projector sessions",
          "duplicate display names",
          "refresh recovery",
          "sequential round synchronization",
          "blocked future round API",
          "autosave",
          "offline draft recovery",
          "same-identity tab synchronization",
          "duplicate guesses",
          "earlier edits",
          "final status invalidation",
          "host override",
          "server lock",
          "answer secrecy",
          "eight reveals",
          "scoring",
          "missing card",
          "CSV download",
          "persistent revisit",
          "390px and 412px layouts",
          "200% text size",
        ],
        artifacts: "test-artifacts/",
        transport: relay
          ? "Node-trusted HTTPS relay; browser TLS trust unchanged"
          : "native browser",
      },
      null,
      2,
    ),
  );
} finally {
  if (relay)
    await Promise.all(
      [hostContext, guestContext, projectorContext, otherContext].map((c) =>
        c.unrouteAll({ behavior: "ignoreErrors" }),
      ),
    );
  await browser.close();
}
