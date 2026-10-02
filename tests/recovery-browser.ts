import { chromium, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { choices } from "../src/shared.ts";
const origin = process.env.TEST_URL || "http://127.0.0.1:3033";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
mkdirSync("test-artifacts/recovery", { recursive: true });
try {
  const hc = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
  });
  const gc = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const rc = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const lc = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  });
  const dc = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const [host, original, recovered, late, display] = await Promise.all([
    hc.newPage(),
    gc.newPage(),
    rc.newPage(),
    lc.newPage(),
    dc.newPage(),
  ]);
  const errors: string[] = [];
  for (const page of [host, original, recovered, late, display])
    page.on("pageerror", (e) => errors.push(e.message));
  await host.goto(origin + "/host");
  await host.getByLabel("Host password").fill("local-rehearsal-only");
  await host
    .getByRole("button", { name: "Open host controls", exact: true })
    .click();
  await host
    .getByLabel("Name your evening")
    .fill("Demo · host-approved recovery");
  await host.getByRole("button", { name: "Create event", exact: true }).click();
  await host.waitForURL(/\/host\/e\//);
  const id = host.url().split("/").at(-1)!,
    path = origin + `/api/events/${id}`;
  const state = async () => (await hc.request.get(path + "?host=1")).json();
  const control = async (action: string, extra = {}) => {
    const e = await state();
    const r = await hc.request.post(path + "/control", {
      headers: { Origin: origin },
      data: { action, revision: e.controlRevision, ...extra },
    });
    assert.equal(r.status(), 200);
  };
  await original.goto(origin + `/e/${id}`);
  assert.equal(await original.locator('input[type="password"]').count(), 0);
  await original.getByLabel("Your name").fill("Recovery Alex");
  await original
    .getByRole("button", { name: "Take my seat", exact: true })
    .click();
  await original.getByText("A good night awaits.", { exact: true }).waitFor();
  const originalToken = await original.evaluate(() =>
    localStorage.getItem("tasting.identity.v1")!,
  );
  const joined = (
    await hc.request.get(path, { headers: { "X-Guest-Token": originalToken } })
  ).json();
  const seat = (await joined).me.id;
  await control("seating", {
    seating: { shape: "round", seats: [seat, null] },
  });
  await control("key", { key: choices });
  await control("start");
  await original.locator("#guess-1").selectOption(choices[0]);
  await original.locator("#rating-1").fill("8.2");
  await original.locator("#notes-1").fill("PRIVATE_RECOVERY_BROWSER_NOTE");
  await expect(original.locator(".save-state.confirmed").first()).toBeVisible();
  await display.goto(origin + `/display/e/${id}`);
  await recovered.goto(origin + `/e/${id}`);
  await recovered
    .getByRole("button", { name: "Recover my seat", exact: true })
    .click();
  await recovered
    .getByLabel("Your existing display name")
    .selectOption({ label: "Recovery Alex" });
  await recovered
    .getByRole("button", { name: "Ask host to approve", exact: true })
    .click();
  await expect(
    recovered.getByText(/Waiting for your host to approve/),
  ).toBeVisible();
  await recovered.reload();
  await expect(
    recovered.getByText(/Waiting for your host to approve/),
  ).toBeVisible();
  assert.equal(await recovered.locator("#notes-1").count(), 0);
  assert.ok(
    !(await recovered.locator("body").innerText()).includes(
      "PRIVATE_RECOVERY_BROWSER_NOTE",
    ),
  );
  await expect(
    host.getByText("Recovery Alex wants to recover their seat", {
      exact: true,
    }),
  ).toBeVisible();
  await host.setViewportSize({ width: 768, height: 1024 });
  for (const label of [
    "Approve recovery for Recovery Alex",
    "Deny recovery for Recovery Alex",
  ]) {
    const box = (await host
      .getByRole("button", { name: label, exact: true })
      .boundingBox())!;
    assert.ok(box.height >= 48);
  }
  await host.screenshot({
    path: "test-artifacts/recovery/host-pending-portrait.png",
    fullPage: true,
  });
  await recovered.screenshot({
    path: "test-artifacts/recovery/guest-pending.png",
    fullPage: true,
  });
  await host
    .getByRole("button", {
      name: "Deny recovery for Recovery Alex",
      exact: true,
    })
    .click();
  await expect(
    recovered.getByText(/Your host denied this request/),
  ).toBeVisible();
  assert.equal(await recovered.locator("#guess-1").count(), 0);
  await recovered
    .getByRole("button", { name: "Ask host to approve", exact: true })
    .click();
  await expect(
    host.getByRole("button", {
      name: "Approve recovery for Recovery Alex",
      exact: true,
    }),
  ).toBeVisible();
  await host
    .getByRole("button", {
      name: "Approve recovery for Recovery Alex",
      exact: true,
    })
    .click();
  await expect(recovered.locator("#notes-1")).toHaveValue(
    "PRIVATE_RECOVERY_BROWSER_NOTE",
  );
  await expect(recovered.locator("#rating-1")).toHaveValue("8.2");
  await original.reload();
  await expect(original.locator("#notes-1")).toHaveValue(
    "PRIVATE_RECOVERY_BROWSER_NOTE",
  );
  const now = await state();
  assert.equal(now.participants, 1);
  assert.deepEqual(now.seating.seats, [seat, null]);
  // Host-generated link is created in the private guest sheet and does not expose anything publicly.
  await host
    .getByRole("button", {
      name: "View Recovery Alex’s scorecard",
      exact: true,
    })
    .click();
  await host
    .getByRole("button", { name: "Create recovery link", exact: true })
    .click();
  await expect(
    host.getByLabel("Recovery URL", { exact: true }),
  ).not.toHaveValue("");
  const url = await host
    .getByLabel("Recovery URL", { exact: true })
    .inputValue();
  await host.getByRole("button", { name: "Close", exact: true }).click();
  const revision = (await state()).revision;
  await late.goto(url);
  await late.reload();
  assert.equal((await state()).revision, revision);
  assert.equal(await late.locator("#notes-1").count(), 0);
  for (let r = 2; r <= 8; r++) {
    await control("unlock");
    const save = await hc.request.put(path + `/entries/${r}`, {
      headers: { Origin: origin, "X-Guest-Token": originalToken },
      data: { guess: choices[r - 1], rating: 8.2, notes: "", revision: 0 },
    });
    assert.equal(save.status(), 200);
  }
  assert.equal(
    (
      await hc.request.post(path + "/submit", {
        headers: { Origin: origin, "X-Guest-Token": originalToken },
        data: {},
      })
    ).status(),
    200,
  );
  await control("lock");
  await late
    .getByRole("button", {
      name: "Recover my seat with this link",
      exact: true,
    })
    .click();
  await expect(late.locator(".personal-round")).toHaveCount(8);
  assert.ok(!late.url().includes("#recover="));
  const lateToken = await late.evaluate(() =>
    localStorage.getItem("tasting.identity.v1")!,
  );
  const locked = await hc.request.get(path, {
    headers: { "X-Guest-Token": lateToken },
  });
  const lockedData = await locked.json();
  assert.equal(lockedData.me.id, seat);
  assert.equal(lockedData.me.submitted, true);
  assert.equal(lockedData.me.entries[1].notes, "PRIVATE_RECOVERY_BROWSER_NOTE");
  assert.equal(
    (
      await hc.request.put(path + "/entries/1", {
        headers: { Origin: origin, "X-Guest-Token": lateToken },
        data: { guess: choices[0], rating: 9, notes: "", revision: 1 },
      })
    ).status(),
    423,
  );
  const retryContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const retry = await retryContext.newPage();
  await retry.goto(url);
  await retry
    .getByRole("button", {
      name: "Recover my seat with this link",
      exact: true,
    })
    .click();
  await expect(retry.getByText(/expired or was already used/)).toBeVisible();
  assert.equal(await retry.locator(".personal-round").count(), 0);
  const publicData = await (
    await dc.request.get(path + "?view=projector")
  ).json();
  assert.equal(publicData.me, undefined);
  assert.equal(publicData.recoveryRequests, undefined);
  assert.ok(
    !JSON.stringify(publicData).includes("PRIVATE_RECOVERY_BROWSER_NOTE"),
  );
  for (const page of [host, recovered, late]) {
    const scan = await new AxeBuilder({ page }).analyze();
    if (scan.violations.length)
      console.log(
        JSON.stringify({ page: page.url(), violations: scan.violations }),
      );
    assert.deepEqual(
      scan.violations.map((v) => v.id),
      [],
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await late.screenshot({
    path: "test-artifacts/recovery/locked-restored-phone.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: PIN-free join, persisted pending requests, touch-friendly host denial/approval, same-seat saved notes/ratings/session/seating, one-use recovery link, link-preview safety, locked recovery/no edits, public display privacy, no overflow, accessibility and page errors.",
  );
} finally {
  await browser.close();
}
