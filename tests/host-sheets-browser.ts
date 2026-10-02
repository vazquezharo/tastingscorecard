import { openOptionalAvatar } from "./browser-helpers";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { choices } from "../src/shared.ts";
import { mkdirSync } from "node:fs";
const origin = process.env.TEST_URL || "http://127.0.0.1:3015";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const hc = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    gc = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    oc = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hc.newPage(),
    guest = await gc.newPage(),
    other = await oc.newPage();
  const errors: string[] = [];
  for (const p of [host, guest, other])
    p.on("pageerror", (e) => errors.push(e.message));
  await host.goto(origin + "/host");
  await host.getByLabel("Host password").fill(process.env.HOST_PASSWORD!);
  await host
    .getByRole("button", { name: "Open host controls", exact: true })
    .click();
  await host.getByLabel("Name your evening").fill("Demo · live host sheets");
  await host.getByRole("button", { name: "Create event", exact: true }).click();
  await host.waitForURL(/\/host\/e\//);
  const id = host.url().split("/").at(-1)!;
  async function control(action: string, extra = {}) {
    const e = await (
      await hc.request.get(`${origin}/api/events/${id}?host=1`)
    ).json();
    assert.equal(
      (
        await hc.request.post(`${origin}/api/events/${id}/control`, {
          headers: { Origin: origin },
          data: { action, revision: e.controlRevision, ...extra },
        })
      ).status(),
      200,
    );
  }
  await control("key", { key: choices });
  await control("start");
  for (const [p, name] of [
    [guest, "Alex"],
    [other, "Blair"],
  ] as const) {
    await p.goto(`${origin}/e/${id}`);
    await p.getByLabel("Your name").fill(name);
    await openOptionalAvatar(p);
    await p.locator(".drawing-surface").click();
    await p.getByRole("button", { name: "Take my seat", exact: true }).click();
    await p.locator("#guess-1").waitFor();
  }
  const trigger = host.getByRole("button", {
    name: "View Alex’s scorecard",
    exact: true,
  });
  await trigger.click();
  const dialog = host.getByRole("dialog");
  await dialog.waitFor();
  assert.ok((await dialog.innerText()).includes("No entry yet."));
  assert.ok((await dialog.innerText()).includes("Not unlocked yet."));
  await guest.locator("#guess-1").selectOption(choices[0]);
  await guest.getByRole("button", { name: "8.0", exact: true }).click();
  await guest
    .locator("#notes-1")
    .fill("Black cherry and cocoa — private host-sheet note.");
  await guest
    .locator(".round-card:not([hidden]) .save-state.confirmed")
    .waitFor();
  await dialog
    .getByText("Black cherry and cocoa — private host-sheet note.", {
      exact: true,
    })
    .waitFor();
  await dialog.getByText("8.0 / 10", { exact: true }).waitFor();
  assert.ok((await dialog.innerText()).includes("1 / 8 correct guesses"));
  const scan = await new AxeBuilder({ page: host })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  assert.equal(
    await dialog.evaluate((e) => e.scrollWidth > e.clientWidth),
    false,
  );
  mkdirSync("test-artifacts/host-sheets", { recursive: true });
  await host.screenshot({
    path: "test-artifacts/host-sheets/live-phone.png",
    fullPage: true,
  });
  await host.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await host.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") ===
      "View Alex’s scorecard",
  );
  for (let r = 2; r <= 8; r++) await control("unlock");
  const token = await guest.evaluate(() =>
    localStorage.getItem("tasting.identity.v1"),
  );
  for (let r = 2; r <= 8; r++)
    assert.equal(
      (
        await hc.request.put(`${origin}/api/events/${id}/entries/${r}`, {
          headers: { Origin: origin, "X-Guest-Token": token! },
          data: { guess: choices[r - 1], rating: 8.1, notes: "", revision: 0 },
        })
      ).status(),
      200,
    );
  assert.equal(
    (
      await hc.request.post(`${origin}/api/events/${id}/submit`, {
        headers: { Origin: origin, "X-Guest-Token": token! },
        data: {},
      })
    ).status(),
    200,
  );
  await trigger.click();
  await dialog
    .getByText("Submitted · 8 / 8 correct guesses", { exact: true })
    .waitFor();
  await hc.request.put(`${origin}/api/events/${id}/entries/2`, {
    headers: { Origin: origin, "X-Guest-Token": token! },
    data: { guess: choices[0], rating: 8.1, notes: "", revision: 1 },
  });
  await dialog
    .getByText("Repeated wine type in rounds 1 & 2.", { exact: true })
    .waitFor();
  assert.ok((await dialog.innerText()).includes("6 / 8 correct guesses"));
  const otherToken = await other.evaluate(() =>
    localStorage.getItem("tasting.identity.v1"),
  );
  const otherData = await (
    await oc.request.get(`${origin}/api/events/${id}`, {
      headers: { "X-Guest-Token": otherToken! },
    })
  ).json();
  assert.equal(otherData.roster, undefined);
  assert.ok(!JSON.stringify(otherData).includes("private host-sheet note"));
  assert.equal(
    (await oc.request.get(`${origin}/api/events/${id}?host=1`)).status(),
    401,
  );
  const projector = await (
    await oc.request.get(`${origin}/api/events/${id}?view=projector`)
  ).json();
  assert.equal(projector.roster, undefined);
  assert.ok(!JSON.stringify(projector).includes("private host-sheet note"));
  await host.setViewportSize({ width: 320, height: 720 });
  await host.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  assert.equal(
    await dialog.evaluate((e) => e.scrollWidth > e.clientWidth),
    false,
  );
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await host.reload();
  await trigger.click();
  await dialog
    .getByText("Black cherry and cocoa — private host-sheet note.", {
      exact: true,
    })
    .waitFor();
  await hc.setOffline(true);
  await dialog
    .getByText("Connection interrupted. Showing the last received scorecard.", {
      exact: true,
    })
    .waitFor();
  await hc.setOffline(false);
  await host.waitForFunction(
    () =>
      !document
        .querySelector("dialog")
        ?.textContent?.includes("Connection interrupted"),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      openGuestSheet: true,
      liveGuessesRatingsNotes: true,
      submissionAndDuplicateUpdates: true,
      readOnly: true,
      hostOnlyPrivacy: true,
      keyboardCloseFocusRestored: true,
      narrowDoubleTextNoOverflow: true,
      refreshAndReconnect: true,
      axeViolations: 0,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
