import { openOptionalAvatar } from "./browser-helpers";
import { chromium, request } from "playwright";
import assert from "node:assert/strict";
import { choices } from "../src/shared.ts";
const origin = process.env.TEST_URL || "http://127.0.0.1:3003";
const relay = process.env.TEST_TRUSTED_HTTPS_RELAY === "1";
const proxy = relay ? { proxy: { server: process.env.HTTPS_PROXY! } } : {};
const api = await request.newContext({
  baseURL: origin,
  ...proxy,
  extraHTTPHeaders: { Origin: origin },
});
assert.equal(
  (
    await api.post("/api/host/login", {
      data: {
        password: process.env.TEST_PASSWORD || process.env.HOST_PASSWORD,
      },
    })
  ).status(),
  200,
);
let event = await (
  await api.post("/api/host/events", {
    data: { name: "Demo · browser PIN recovery" },
  })
).json();
async function control(action: string, extra = {}) {
  event = await (await api.get(`/api/events/${event.id}?host=1`)).json();
  const r = await api.post(`/api/events/${event.id}/control`, {
    data: { action, revision: event.controlRevision, ...extra },
  });
  assert.equal(r.status(), 200);
}
await control("key", { key: choices });
await control("start");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const contexts = await Promise.all(
  [1, 2, 3].map(() =>
    browser.newContext({
      ...proxy,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
  ),
);
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
const [original, recovered, late] = await Promise.all(
  contexts.map((c) => c.newPage()),
);
try {
  await original.goto(`${origin}/e/${event.id}`);
  await original.getByLabel("Your name").fill("Recovery Alex");
  await original
    .getByLabel("Create a recovery PIN", { exact: true })
    .fill("4826");
  await openOptionalAvatar(original);
  await original.locator(".drawing-surface").click();
  await original
    .getByRole("button", { name: "Take my seat", exact: true })
    .click();
  await original.locator("#guess-1").selectOption(choices[0]);
  await original.getByRole("button", { name: "8.0", exact: true }).click();
  await original.locator("#notes-1").fill("Saved before switching browsers");
  await original.locator(".save-state.confirmed").waitFor();
  const before = await original.evaluate(
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
  await recovered.goto(`${origin}/e/${event.id}`);
  await recovered
    .getByRole("button", { name: "Recover my seat", exact: true })
    .click();
  await recovered.getByLabel("Your name").fill("recovery alex");
  await recovered.getByLabel("Your recovery PIN").fill("0000");
  await recovered
    .getByRole("button", { name: "Recover scorecard", exact: true })
    .click();
  await recovered
    .getByText("Name or PIN not recognized.", { exact: false })
    .waitFor();
  await recovered.getByLabel("Your recovery PIN").fill("4826");
  await recovered
    .getByRole("button", { name: "Recover scorecard", exact: true })
    .click();
  await recovered.locator("#guess-1").waitFor();
  assert.equal(await recovered.locator("#rating-1").inputValue(), "8");
  assert.equal(
    await recovered.locator("#notes-1").inputValue(),
    "Saved before switching browsers",
  );
  await recovered.reload();
  await recovered.locator("#guess-1").waitFor();
  assert.equal(await recovered.locator("#guess-1").inputValue(), choices[0]);
  await original.reload();
  await original.locator("#guess-1").waitFor();
  await recovered
    .getByText("Session recovery & event link", { exact: true })
    .click();
  await recovered.getByLabel("New recovery PIN").fill("5731");
  await recovered
    .getByRole("button", { name: "Save recovery PIN", exact: true })
    .click();
  await recovered.getByText("Recovery PIN saved.", { exact: false }).waitFor();
  for (let r = 2; r <= 8; r++) await control("unlock");
  await control("lock", { override: true });
  await late.goto(`${origin}/e/${event.id}`);
  await late.locator("summary").filter({ hasText: "Recover my seat" }).click();
  await late.getByLabel("Your name").fill("Recovery Alex");
  await late.getByLabel("Your recovery PIN").fill("4826");
  await late
    .getByRole("button", { name: "Recover scorecard", exact: true })
    .click();
  await late
    .getByText("Name or PIN not recognized.", { exact: false })
    .waitFor();
  await late.getByLabel("Your recovery PIN").fill("5731");
  await late
    .getByRole("button", { name: "Recover scorecard", exact: true })
    .click();
  await late
    .getByText("Session recovery & event link", { exact: true })
    .waitFor();
  const after = await late.evaluate(
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
  assert.equal(after.me.id, before.me.id);
  assert.equal(after.participants, 1);
  assert.equal(after.me.entries[1].rating, 8);
  assert.equal(after.me.recoveryHash, undefined);
  assert.equal(after.me.tokenAliases, undefined);
  assert.equal(after.results[0].wine, undefined);
  assert.equal(
    await late.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        eventId: event.id,
        checks: [
          "join with PIN",
          "wrong PIN rejected",
          "same seat in fresh browser",
          "saved ratings/notes and refresh",
          "original browser remains connected",
          "PIN change invalidates old PIN",
          "recover after lock",
          "no duplicate participant",
          "no credential or unrevealed answer leak",
          "390px layout",
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
  await api.dispose();
}
