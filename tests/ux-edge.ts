import { openOptionalAvatar } from "./browser-helpers";
import { chromium, request } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { choices } from "../src/shared.ts";
mkdirSync("test-artifacts/ux-edge", { recursive: true });
const origin = process.env.TEST_URL || "http://127.0.0.1:3010";
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
let e = await (
  await api.post("/api/host/events", {
    data: { name: "Demo · UX recovery edges" },
  })
).json();
async function control(action: string, extra = {}) {
  e = await (await api.get(`/api/events/${e.id}?host=1`)).json();
  assert.equal(
    (
      await api.post(`/api/events/${e.id}/control`, {
        data: { action, revision: e.controlRevision, ...extra },
      })
    ).status(),
    200,
  );
}
await control("key", { key: choices });
await control("start");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
await c.addInitScript(
  "for(const k of ['getItem','setItem','removeItem'])Object.defineProperty(Storage.prototype,k,{value:function(){throw new DOMException('Storage disabled','SecurityError')}})",
);
const p = await c.newPage();
const errors: string[] = [];
p.on("pageerror", (x) => errors.push(x.message));
try {
  await p.goto(`${origin}/e/${e.id}`);
  await p.getByLabel("Your name").fill("Storage guest");
  await p.getByLabel("Create a recovery PIN", { exact: true }).fill("4826");
  await openOptionalAvatar(p);
  await p.locator(".drawing-surface").click();
  await p.getByRole("button", { name: "Take my seat", exact: true }).click();
  await p.locator("#guess-1").waitFor();
  assert.match(await p.locator("body").innerText(), /storage/i);
  await p.screenshot({
    path: "test-artifacts/ux-edge/storage-unavailable.png",
    fullPage: true,
  });
  await p.setViewportSize({ width: 320, height: 720 });
  const baseSize = await p
    .locator('label[for="rating-1"]')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await p.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  const largeSize = await p
    .locator('label[for="rating-1"]')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  assert.equal(largeSize, baseSize * 2);
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await p.getByRole("button", { name: "10.0", exact: true }).click();
  assert.equal(
    Number(await p.getByLabel("Your rating", { exact: true }).inputValue()),
    10,
  );
  await p.screenshot({
    path: "test-artifacts/ux-edge/scorecard-text-200-percent.png",
    fullPage: true,
  });
  await p.evaluate(() => (document.documentElement.style.fontSize = ""));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.locator("#guess-1").focus();
  await p.keyboard.press("Tab");
  assert.ok(await p.locator("button:focus,input:focus").count());

  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  await p.route("**/entries/1", async (r) => {
    await hold;
    await r.continue();
  });
  await p.locator("#guess-1").selectOption(choices[0]);
  await p.getByRole("button", { name: "8.0", exact: true }).click();
  await p.getByText("Saving…", { exact: true }).waitFor();
  assert.equal(await p.locator(".save-state.confirmed").count(), 0);
  release();
  await p.locator(".save-state.confirmed").waitFor();
  await p.unroute("**/entries/1");
  await c.setOffline(true);
  await p.getByLabel("Notes").fill("Private unsaved edge note");
  await p.getByRole("button", { name: "Retry save", exact: true }).waitFor();
  await control("unlock");
  await control("unlock");
  await control("unlock");
  await control("unlock");
  await control("unlock");
  await control("unlock");
  await control("unlock");
  await control("lock", { override: true });
  await c.setOffline(false);
  await p
    .getByRole("region", { name: "Unsaved edits after lock" })
    .waitFor()
    .catch(async () => {
      await p.locator('[aria-label="Unsaved edits after lock"]').waitFor();
    });
  await p
    .getByText("View my unsaved drafts (private)", { exact: true })
    .click();
  await p.getByText("Private unsaved edge note", { exact: true }).waitFor();
  await p.screenshot({
    path: "test-artifacts/ux-edge/locked-private-draft.png",
    fullPage: true,
  });
  const publicEvent = await (await api.get(`/api/events/${e.id}`)).json();
  assert.ok(!JSON.stringify(publicEvent).includes("Private unsaved edge note"));
  assert.ok(!JSON.stringify(publicEvent).includes("St. Francis"));
  const hc = await browser.newContext({
    storageState: await api.storageState(),
  });
  const host = await hc.newPage();
  await host.goto(`${origin}/host/e/${e.id}`);
  await host
    .getByRole("button", { name: "Reveal wine 1", exact: true })
    .waitFor();
  await hc.addCookies([
    { name: "tasting_host", value: "0.invalid", url: origin },
  ]);
  await host.evaluate(() => window.dispatchEvent(new Event("online")));
  await host
    .getByRole("heading", { name: "Sign in again", exact: true })
    .waitFor();
  await host.getByLabel("Host password").fill(process.env.HOST_PASSWORD!);
  await host
    .getByRole("button", { name: "Open host controls", exact: true })
    .click();
  await host
    .getByRole("button", { name: "Reveal wine 1", exact: true })
    .waitFor();
  await hc.setOffline(true);
  await host
    .getByText("Could not reach the tasting.", { exact: false })
    .waitFor();
  assert.equal(
    await host
      .getByRole("button", { name: "Reveal wine 1", exact: true })
      .isDisabled(),
    true,
  );
  await hc.setOffline(false);
  await host.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Reveal wine 1"),
      )?.disabled,
  );
  await host.screenshot({
    path: "test-artifacts/ux-edge/host-session-recovered.png",
    fullPage: true,
  });
  await host.goto(origin + "/host");
  await host.getByLabel("Name your evening").fill("Demo · repeated create");
  let creates = 0;
  await host.route("**/api/host/events", async (route) => {
    if (route.request().method() === "POST") {
      creates++;
      await new Promise((r) => setTimeout(r, 500));
    }
    await route.continue();
  });
  await host.locator("form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await host.waitForURL(/\/host\/e\//);
  assert.equal(creates, 1);
  console.log({ pageErrors: errors });
  assert.equal(errors.length, 0);
  writeFileSync(
    "test-artifacts/ux-edge/edge-report.json",
    JSON.stringify(
      {
        blockedStorageJoin: true,
        backendConfirmedSave: true,
        noPrematureSaved: true,
        privateDraftSurvivesOverride: true,
        notesAndAnswersPrivate: true,
        expiredHostSessionRecovery: true,
        hostOfflineControlsDisabled: true,
        repeatedCreateOneRequest: true,
        genuineDoubleTextSize: true,
        keyboardAccess: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "UX storage, delayed-save, private locked draft and host-session recovery passed",
  );
} finally {
  await browser.close();
  await api.dispose();
}
