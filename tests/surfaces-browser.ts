import { chromium, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { choices } from "../src/shared.ts";
const origin = process.env.TEST_URL || "http://127.0.0.1:3030";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const hc = await b.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
  }),
  gc = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }),
  dc = await b.newContext({ viewport: { width: 1280, height: 720 } });
const host = await hc.newPage(),
  guest = await gc.newPage(),
  display = await dc.newPage();
const errors: string[] = [],
  mutations: string[] = [];
for (const p of [host, guest, display])
  p.on("pageerror", (e) => errors.push(e.message));
display.on("request", (r) => {
  if (r.url().includes("/api/") && r.method() !== "GET")
    mutations.push(r.url());
});
mkdirSync("test-artifacts/surfaces", { recursive: true });
try {
  await host.goto(origin + "/host");
  await host.getByLabel("Host password").fill("local-rehearsal-only");
  await host
    .getByRole("button", { name: "Open host controls", exact: true })
    .click();
  await host.getByLabel("Name your evening").fill("Fictional · Three surfaces");
  await host.getByRole("button", { name: "Create event", exact: true }).click();
  await host.waitForURL(/\/host\/e\//);
  const id = host.url().split("/").at(-1)!,
    path = `/api/events/${id}`;
  const read = async () => {
    const state = await (
      await hc.request.get(origin + path + "?host=1")
    ).json();
    delete state.serverTime;
    return state;
  };
  const control = async (action: string, extra = {}) => {
    const state = await read();
    const res = await hc.request.post(origin + path + "/control", {
      data: { action, revision: state.controlRevision, ...extra },
    });
    assert.equal(res.status(), 200, await res.text());
  };
  await guest.goto(origin + `/e/${id}`);
  await guest.getByLabel("Your name").fill("Alex Guest");
  await guest
    .getByRole("button", { name: "Take my seat", exact: true })
    .click();
  await expect.poll(async () => (await read()).participants).toBe(1);
  const base = await read();
  await display.goto(origin + `/display/e/${id}`);
  await display.locator(".qr-panel img").waitFor();
  await expect(display.locator("button, input, select, textarea")).toHaveCount(
    0,
  );
  await display.getByText("Alex Guest", { exact: true }).waitFor();
  await display.reload();
  await display.getByText("Alex Guest", { exact: true }).waitFor();
  assert.deepEqual(await read(), base);
  await display.goto(origin + `/projector/e/${id}`);
  await display.getByText("Alex Guest", { exact: true }).waitFor();
  assert.deepEqual(await read(), base);
  await display.screenshot({
    path: "test-artifacts/surfaces/waiting-1280.png",
  });
  await control("key", { key: choices });
  await host.reload();
  await host
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  await expect(display.getByRole("heading", { name: /Round 1/ })).toBeVisible();
  await expect(host.getByRole("region", { name: "Event state" })).toContainText(
    "Round 1 of 8",
  );
  const token = await guest.evaluate(() =>
    localStorage.getItem("tasting.identity.v1")!,
  );
  for (let round = 1; round <= 8; round++) {
    if (round > 1) {
      await host
        .getByRole("button", { name: `Open round ${round}`, exact: true })
        .click();
      await expect(
        display.getByRole("heading", { name: new RegExp(`Round ${round}`) }),
      ).toBeVisible();
    }
    const data = await (
      await gc.request.get(origin + path, {
        headers: { "X-Guest-Token": token },
      })
    ).json();
    const res = await gc.request.put(origin + path + `/entries/${round}`, {
      headers: { "X-Guest-Token": token },
      data: {
        guess: choices[round - 1],
        rating: 8.4,
        notes: "PRIVATE_SURFACES_NOTE",
        revision: data.me.entries[round]?.revision || 0,
      },
    });
    assert.equal(res.status(), 200);
    await expect(display.locator(".table-display")).toContainText(
      "1 / 1 Ready",
    );
    const publicData = await (
      await dc.request.get(origin + path + "?view=projector", {
        headers: { "X-Guest-Token": token },
      })
    ).json();
    assert.equal(publicData.me, undefined);
    assert.equal(publicData.key, undefined);
    assert.equal(publicData.roster, undefined);
    assert.equal(publicData.parade, undefined);
    assert.deepEqual(publicData.results, []);
    assert.equal(publicData.summary, undefined);
    for (const name of ["wines", "bottlePhotos", "purchaseUrl"])
      assert.equal(publicData[name], undefined);
    assert.ok(!JSON.stringify(publicData).includes("PRIVATE_SURFACES_NOTE"));
    assert.ok(
      !choices.some((w) => JSON.stringify(publicData.tableGuests).includes(w)),
    );
    if (round === 1) {
      await control("timerStart", { seconds: 60 });
      await expect(display.locator(".round-clock")).toBeVisible();
      await expect(guest.locator(".round-clock")).toBeVisible();
      for (const v of [
        { width: 1024, height: 768 },
        { width: 768, height: 1024 },
      ]) {
        await host.setViewportSize(v);
        await host.evaluate(() => scrollTo(0, 0));
        assert.equal(
          await host.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        const rect = await host
          .getByRole("button", { name: "Open round 2", exact: true })
          .boundingBox();
        assert.ok(
          rect && rect.height >= 48 && rect.y + rect.height <= v.height,
        );
        await host.screenshot({
          path: `test-artifacts/surfaces/host-${v.width}.png`,
        });
      }
      for (const v of [
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
      ]) {
        await display.setViewportSize(v);
        assert.equal(
          await display.evaluate(
            () =>
              document.documentElement.scrollHeight > innerHeight ||
              document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await display.screenshot({
          path: `test-artifacts/surfaces/tasting-${v.width}.png`,
        });
      }
      const before = await read();
      await display.reload();
      await expect(display.locator(".round-clock")).toBeVisible();
      assert.deepEqual(await read(), before);
      for (const p of [host, display, guest]) {
        const scan = await new AxeBuilder({ page: p })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.deepEqual(
          scan.violations.map((v) => v.id),
          [],
        );
      }
    }
  }
  await gc.request.post(origin + path + "/submit", {
    headers: { "X-Guest-Token": token },
    data: {},
  });
  await expect(host.getByRole("region", { name: "Event state" })).toContainText(
    "1 / 1",
  );
  host.once("dialog", (d) => {
    assert.match(d.message(), /Pending saves.*cannot be detected/);
    return d.dismiss();
  });
  await host
    .getByRole("button", {
      name: "Lock submissions & open results",
      exact: true,
    })
    .click();
  assert.equal((await read()).phase, "tasting");
  host.once("dialog", (d) => d.accept());
  await host
    .getByRole("button", {
      name: "Lock submissions & open results",
      exact: true,
    })
    .click();
  await expect(display.getByRole("heading", { name: /Wine 1/ })).toBeVisible();
  await expect(
    guest.getByRole("heading", { name: "Final Scorecard", exact: true }),
  ).toBeVisible();
  for (let round = 1; round <= 8; round++) {
    if (round > 1) await control("next");
    await control("reveal");
    await expect(display.locator(".signature-identity h2")).toHaveText(
      choices[round - 1],
    );
    assert.equal(
      (await (await dc.request.get(origin + path + "?view=projector")).json())
        .summary,
      undefined,
    );
  }
  await host
    .getByRole("button", { name: "Open final summary", exact: true })
    .click();
  await expect(display.locator(".signature-final")).toBeVisible();
  const final = await read();
  await dc.close();
  assert.deepEqual(await read(), final);
  assert.deepEqual(errors, []);
  assert.deepEqual(mutations, []);
  console.log(
    JSON.stringify({
      passed: true,
      ipadLandscapePortrait: true,
      phoneGuest: true,
      display16by9: true,
      readonlyOpenRefreshClose: true,
      privacy: true,
      lockCancelConfirm: true,
      eightRoundsAndExistingReveals: true,
      pageErrors: 0,
    }),
  );
} finally {
  await b.close();
}
