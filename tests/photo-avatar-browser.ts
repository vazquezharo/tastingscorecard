import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import sharp from "sharp";
import { choices } from "../src/shared.ts";
import { mkdirSync } from "node:fs";
const origin = process.env.TEST_URL || "http://127.0.0.1:3014";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const photo = await sharp({
  create: { width: 600, height: 400, channels: 3, background: "#8cc7df" },
})
  .png()
  .toBuffer();
const second = await sharp({
  create: { width: 400, height: 600, channels: 3, background: "#e9a0ad" },
})
  .png()
  .toBuffer();
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const hc = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    gc = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    rc = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hc.newPage(),
    guest = await gc.newPage(),
    recovered = await rc.newPage();
  const errors: string[] = [];
  for (const p of [host, guest, recovered])
    p.on("pageerror", (e) => errors.push(e.message));
  await host.goto(origin + "/host");
  await host.getByLabel("Host password").fill(process.env.HOST_PASSWORD!);
  await host
    .getByRole("button", { name: "Open host controls", exact: true })
    .click();
  await host.getByLabel("Name your evening").fill("Demo · photo avatars");
  await host.getByRole("button", { name: "Create event", exact: true }).click();
  await host.waitForURL(/\/host\/e\//);
  const id = host.url().split("/").at(-1)!;
  await guest.goto(`${origin}/e/${id}`);
  await guest.getByLabel("Your name").fill("Photo guest");
  await guest.getByLabel("Create a recovery PIN", { exact: true }).fill("4826");
  await guest.getByText("Add an avatar (optional)", { exact: true }).click();
  const join = guest.getByRole("button", { name: "Take my seat", exact: true });
  assert.equal(await join.isDisabled(), false);
  await guest.getByLabel("Avatar photo", { exact: true }).setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await guest.getByRole("alert").filter({ hasText: "Choose a JPEG" }).waitFor();
  assert.equal(await join.isDisabled(), false);
  await guest
    .getByLabel("Avatar photo", { exact: true })
    .setInputFiles({ name: "test.png", mimeType: "image/png", buffer: photo });
  await guest.getByText("Your photo is ready.", { exact: true }).waitFor();
  assert.equal(await join.isDisabled(), false);
  assert.equal(await guest.locator(".drawing-surface").count(), 0);
  const scan = await new AxeBuilder({ page: guest })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  mkdirSync("test-artifacts/photo-avatar", { recursive: true });
  await guest.screenshot({
    path: "test-artifacts/photo-avatar/join-phone.png",
    fullPage: true,
  });
  await join.click();
  await guest.locator(".event-line .avatar-icon img").waitFor();
  await guest.reload();
  await guest.locator(".event-line .avatar-icon img").waitFor();
  await host
    .locator(".roster .avatar-icon img")
    .waitFor()
    .catch(async () => {
      await host.locator(".avatar-icon img").waitFor();
    });
  await guest.getByText("Draw or edit your icon", { exact: true }).click();
  await guest.getByLabel("Avatar photo", { exact: true }).setInputFiles({
    name: "second.png",
    mimeType: "image/png",
    buffer: second,
  });
  await guest.getByRole("button", { name: "Save icon", exact: true }).click();
  await guest.locator(".avatar-editor[open]").waitFor({ state: "hidden" });
  const token = await guest.evaluate(() =>
    localStorage.getItem("tasting.identity.v1"),
  );
  let saved = await (
    await hc.request.get(`${origin}/api/events/${id}`, {
      headers: { "X-Guest-Token": token! },
    })
  ).json();
  assert.ok(saved.me.avatarPhoto.length < 12000);
  const old = saved.me.avatarPhoto;
  assert.equal(
    (
      await hc.request.put(`${origin}/api/events/${id}/avatar`, {
        headers: { "X-Guest-Token": token!, Origin: origin },
        data: { avatar: [], avatarPhoto: "data:image/svg+xml;base64,PHN2Zz4=" },
      })
    ).status(),
    400,
  );
  assert.equal(
    (
      await (
        await hc.request.get(`${origin}/api/events/${id}`, {
          headers: { "X-Guest-Token": token! },
        })
      ).json()
    ).me.avatarPhoto,
    old,
  );
  await recovered.goto(`${origin}/e/${id}`);
  await recovered
    .getByRole("button", { name: "Recover my seat", exact: true })
    .click();
  await recovered.getByLabel("Your name").fill("Photo guest");
  await recovered.getByLabel("Your recovery PIN", { exact: true }).fill("4826");
  await recovered
    .getByRole("button", { name: "Recover scorecard", exact: true })
    .click();
  await recovered.locator(".event-line .avatar-icon img").waitFor();
  async function control(action: string, extra = {}) {
    const e = await (
      await hc.request.get(`${origin}/api/events/${id}?host=1`)
    ).json();
    const r = await hc.request.post(`${origin}/api/events/${id}/control`, {
      headers: { Origin: origin },
      data: { action, revision: e.controlRevision, ...extra },
    });
    assert.equal(r.status(), 200);
  }
  await control("key", { key: choices });
  await control("start");
  for (let r = 1; r <= 8; r++) {
    if (r > 1) await control("unlock");
    assert.equal(
      (
        await hc.request.put(`${origin}/api/events/${id}/entries/${r}`, {
          headers: { Origin: origin, "X-Guest-Token": token! },
          data: {
            guess: choices[r - 1],
            rating: 8,
            notes: "Private photo guest notes",
            revision: 0,
          },
        })
      ).status(),
      200,
    );
  }
  assert.equal(
    (
      await hc.request.post(`${origin}/api/events/${id}/submit`, {
        headers: { Origin: origin, "X-Guest-Token": token! },
        data: {},
      })
    ).status(),
    200,
  );
  await control("lock");
  await control("reveal");
  await recovered
    .locator(".final-scorecard .event-line .avatar-icon img")
    .waitFor();
  for (let r = 2; r <= 8; r++) {
    await control("next");
    await control("reveal");
  }
  await control("summary");
  await recovered
    .getByText("Final rankings & evening recap", { exact: true })
    .click();
  await recovered.locator(".leader-row .avatar-icon img").waitFor();
  await recovered.screenshot({
    path: "test-artifacts/photo-avatar/summary-phone.png",
    fullPage: true,
  });
  const final = await (
    await hc.request.get(`${origin}/api/events/${id}`)
  ).json();
  assert.equal(final.summary.leaderboard[0].avatarPhoto, old);
  assert.equal(final.summary.leaderboard[0].score, 8);
  assert.ok(!JSON.stringify(final).includes("Private photo guest notes"));
  assert.equal(
    await recovered.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      uploadAndPreview: true,
      unsafeFileRejected: true,
      serverPhotoValidation: true,
      replaceAndRefresh: true,
      recovery: true,
      hostAndRevealAndSummaryPhotos: true,
      photoSize: old.length,
      axeViolations: 0,
      notesPrivate: true,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
