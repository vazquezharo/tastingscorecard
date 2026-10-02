import { openOptionalAvatar } from "./browser-helpers";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { choices } from "../src/shared.ts";
const origin = process.env.TEST_URL || "http://127.0.0.1:3004";
const relay = process.env.TEST_TRUSTED_HTTPS_RELAY === "1";
const proxy = relay ? { proxy: { server: process.env.HTTPS_PROXY! } } : {};
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const contexts = await Promise.all([
  browser.newContext({ ...proxy, viewport: { width: 1280, height: 900 } }),
  browser.newContext({
    ...proxy,
    viewport: { width: 390, height: 844 },
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
        } catch {}
      }
    });
const [host, guest] = await Promise.all(contexts.map((c) => c.newPage()));
const button = (p: typeof host, name: string) =>
  p.getByRole("button", { name, exact: true });
try {
  await host.goto(origin + "/host");
  await host
    .getByLabel("Host password")
    .fill(process.env.TEST_PASSWORD || process.env.HOST_PASSWORD!);
  await button(host, "Open host controls").click();
  await host.getByLabel("Name your evening").fill("Demo · guest removal");
  await button(host, "Create event").click();
  await host.waitForURL(/\/host\/e\//);
  const id = host.url().split("/").at(-1)!;
  await guest.goto(`${origin}/e/${id}`);
  await guest.getByLabel("Your name").fill("Alex");
  await guest.getByLabel("Create a recovery PIN", { exact: true }).fill("4826");
  await openOptionalAvatar(guest);
  await guest.locator(".drawing-surface").click();
  await button(guest, "Take my seat").click();
  await button(host, "Remove Alex").waitFor({ timeout: 15000 });
  for (let r = 1; r <= 8; r++)
    await host
      .getByLabel(`Answer for round ${r}`, { exact: true })
      .selectOption(choices[r - 1]);
  await button(host, "Save answer key").click();
  await button(host, "Start round 1").click();
  await guest.locator("#guess-1").selectOption(choices[0]);
  await button(guest, "8.0").click();
  await guest.locator("#notes-1").fill("Old seat private note");
  await guest.locator(".save-state.confirmed").waitFor();
  const old = await guest.evaluate(
    async (id) =>
      (
        await fetch(`/api/events/${id}`, {
          headers: {
            "X-Guest-Token": localStorage.getItem("tasting.identity.v1")!,
          },
        })
      ).json(),
    id,
  );
  await guest.evaluate(
    ({ id, generation }) =>
      localStorage.setItem(
        `tasting.draft.v1:${id}:${generation}:${localStorage.getItem("tasting.identity.v1")}:1`,
        JSON.stringify({
          draft: {
            guess: "Pinot Noir",
            rating: 9,
            notes: "Orphan draft must never return",
          },
          revision: 0,
        }),
      ),
    { id, generation: old.generation },
  );
  host.once("dialog", (dialog) => dialog.dismiss());
  await button(host, "Remove Alex").click();
  assert.equal(await button(host, "Remove Alex").count(), 1);
  host.once("dialog", (dialog) => dialog.accept());
  await button(host, "Remove Alex").click();
  await button(host, "Remove Alex").waitFor({
    state: "detached",
    timeout: 15000,
  });
  await guest.getByLabel("Your name").waitFor({ timeout: 15000 });
  const removed = await guest.evaluate(
    async (id) =>
      (
        await fetch(`/api/events/${id}`, {
          headers: {
            "X-Guest-Token": localStorage.getItem("tasting.identity.v1")!,
          },
        })
      ).json(),
    id,
  );
  assert.equal(removed.participants, 0);
  assert.equal(removed.me, undefined);
  await button(guest, "Recover my seat").click();
  await guest.getByLabel("Your name").fill("Alex");
  await guest.getByLabel("Your recovery PIN").fill("4826");
  await button(guest, "Recover scorecard").click();
  await guest
    .getByText("Name or PIN not recognized.", { exact: false })
    .waitFor();
  await button(guest, "New guest").click();
  await guest.getByLabel("Create a recovery PIN", { exact: true }).fill("5731");
  await openOptionalAvatar(guest);
  await guest.locator(".drawing-surface").click();
  await button(guest, "Take my seat").click();
  await guest.locator("#guess-1").waitFor();
  assert.equal(await guest.locator("#guess-1").inputValue(), "");
  assert.equal(await guest.locator("#rating-1").inputValue(), "");
  assert.equal(await guest.locator("#notes-1").inputValue(), "");
  const fresh = await guest.evaluate(
    async (id) =>
      (
        await fetch(`/api/events/${id}`, {
          headers: {
            "X-Guest-Token": localStorage.getItem("tasting.identity.v1")!,
          },
        })
      ).json(),
    id,
  );
  assert.notEqual(fresh.me.id, old.me.id);
  assert.equal(fresh.participants, 1);
  assert.deepEqual(fresh.me.entries, {});
  assert.equal(
    await guest.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        eventId: id,
        checks: [
          "host removal button and cancel/confirm",
          "live host and guest count synchronization",
          "removed seat loses token and PIN access",
          "fresh seat does not restore old drafts",
          "mobile layout",
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
