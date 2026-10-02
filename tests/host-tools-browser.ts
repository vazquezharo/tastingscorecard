import { openOptionalAvatar } from "./browser-helpers";
import { chromium, expect } from "playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { choices } from "../src/shared.ts";

const origin = process.env.TEST_URL || "http://127.0.0.1:3018";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const hc = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const gc = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const rc = await browser.newContext({
    viewport: { width: 412, height: 915 },
  });
  const dc = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const host = await hc.newPage(),
    guest = await gc.newPage(),
    recovered = await rc.newPage(),
    display = await dc.newPage();
  const errors: string[] = [];
  for (const page of [host, guest, recovered, display])
    page.on("pageerror", (e) => errors.push(e.message));
  await host.goto(origin + "/host");
  await host.getByLabel("Host password").fill("local-rehearsal-only");
  await host
    .getByRole("button", { name: "Open host controls", exact: true })
    .click();
  const name = "Demo · corrected bottles and gentle timer";
  await host.getByLabel("Name your evening").fill(name);
  await host.getByRole("button", { name: "Create event", exact: true }).click();
  await host.waitForURL(/\/host\/e\//);
  const id = host.url().split("/").at(-1)!,
    path = `${origin}/api/events/${id}`;
  const read = async () => (await hc.request.get(path + "?host=1")).json();
  const control = async (action: string, extra = {}, expected = 200) => {
    const e = await read();
    const response = await hc.request.post(path + "/control", {
      headers: { Origin: origin },
      data: { action, revision: e.controlRevision, ...extra },
    });
    assert.equal(response.status(), expected);
    return response.json();
  };
  await guest.goto(origin + "/e/" + id);
  await guest.getByLabel("Your name").fill("Alex");
  await openOptionalAvatar(guest);
  await guest.locator(".drawing-surface").click();
  await guest
    .getByRole("button", { name: "Take my seat", exact: true })
    .click();
  await control("key", { key: [...choices] });
  await control("start");
  await expect(guest.locator("#guess-1")).toBeVisible();
  await guest.locator("#guess-1").selectOption(choices[0]);
  await guest.getByRole("button", { name: "7.0", exact: true }).click();
  await guest.locator("#notes-1").fill("Private retained note");
  await expect(guest.locator(".save-state.confirmed")).toBeVisible();
  const before = await read();
  const entry = before.roster[0].entries[1];
  await display.goto(origin + "/projector/e/" + id);
  // Correct swapped bottles through the host UI, with explicit review and confirmation.
  await host.getByText("Event setup & fixes", { exact: true }).click();
  await host.getByText("Correct pouring order", { exact: true }).click();
  const correction = host.locator(".pouring-correction");
  await correction
    .getByLabel("Corrected round 1", { exact: true })
    .selectOption(choices[1]);
  await expect(
    correction.getByRole("button", { name: "Save corrected pouring order" }),
  ).toBeDisabled();
  await correction
    .getByLabel("Corrected round 2", { exact: true })
    .selectOption(choices[0]);
  await correction
    .getByLabel("Reason for correction")
    .fill("PRIVATE swapped first two bottles");
  await correction
    .getByLabel("Type event name to confirm correction")
    .fill(name);
  await expect(correction.locator(".correction-preview")).toContainText(
    "Round 1: Pinot Noir → Grenache",
  );
  await correction
    .getByRole("button", { name: "Save corrected pouring order" })
    .click();
  await expect(
    correction.getByText("Pouring order corrected. Scorecards preserved."),
  ).toBeVisible();
  assert.deepEqual((await read()).roster[0].entries[1], entry);
  await host.reload();
  if (
    !(await host
      .locator(".event-administration")
      .evaluate((el) => (el as HTMLDetailsElement).open))
  )
    await host.getByText("Event setup & fixes", { exact: true }).click();
  await host
    .getByText("Pouring-order correction history", { exact: true })
    .click();
  await expect(host.locator(".correction-history")).toContainText(
    "PRIVATE swapped first two bottles",
  );
  for (const page of [guest, display])
    assert.ok(
      !(await page.locator("body").innerText()).includes("PRIVATE swapped"),
    );
  // Host-assisted recovery restores the same guest in an independent browser.
  await host
    .getByRole("button", { name: "View Alex’s scorecard", exact: true })
    .click();
  await host
    .getByRole("button", { name: "Create recovery link", exact: true })
    .click();
  const recoveryUrl = await host
    .getByLabel("Recovery URL", { exact: true })
    .inputValue();
  await host.getByRole("button", { name: "Close", exact: true }).click();
  await recovered.goto(recoveryUrl);
  await recovered
    .getByRole("button", {
      name: "Recover my seat with this link",
      exact: true,
    })
    .click();
  await expect(recovered.locator("#notes-1")).toHaveValue(
    "Private retained note",
  );
  await guest.reload();
  await expect(guest.locator("#notes-1")).toHaveValue("Private retained note");
  assert.equal((await read()).participants, 1);
  // Timer controls synchronize across host, original/recovered guest and display.
  await host.getByText("Round timer", { exact: true }).click();
  await host.getByLabel("Timer duration").selectOption("30");
  await host.getByRole("button", { name: "Start timer", exact: true }).click();
  for (const page of [host, guest, recovered, display])
    await expect(page.getByRole("timer")).toBeVisible();
  await host.getByRole("button", { name: "Pause timer", exact: true }).click();
  for (const page of [host, guest, display])
    await expect(page.locator(".round-clock")).toContainText("PAUSED");
  const paused = await guest.getByRole("timer").innerText();
  await guest.reload();
  await expect(guest.getByRole("timer")).toHaveText(paused);
  await host.getByRole("button", { name: "Resume timer", exact: true }).click();
  await expect(guest.locator(".round-clock")).not.toContainText("PAUSED");
  // Add fictional participants to exercise all shapes with twenty seats and long names.
  for (let i = 2; i <= 20; i++) {
    const response = await hc.request.post(path + "/join", {
      headers: { Origin: origin, "X-Guest-Token": randomUUID() },
      data: {
        name: `Guest ${i} · Long fictional tasting name`,
        avatar: [{ color: "#d6ad69", points: [[10, 10]] }],
      },
    });
    assert.equal(response.status(), 200);
  }
  const guests = (await read()).tableGuests;
  mkdirSync("test-artifacts", { recursive: true });
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
  ]) {
    await display.setViewportSize(viewport);
    for (const shape of ["round", "square", "rectangle"]) {
      await control("seating", {
        seating: { shape, seats: guests.map((g: { id: string }) => g.id) },
      });
      await expect(
        display.locator(`.table-${shape}.compact-seats`),
      ).toBeVisible();
      await expect(display.locator(".table-seat")).toHaveCount(20);
      await display.screenshot({
        path: `test-artifacts/compact-${shape}-${viewport.width}.png`,
      });
      const boxes = await display.locator(".table-seat").evaluateAll((cards) =>
        cards.map((c) => {
          const r = c.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }),
      );
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i],
            b = boxes[j];
          assert.ok(
            a.right <= b.left ||
              b.right <= a.left ||
              a.bottom <= b.top ||
              b.bottom <= a.top,
            `Seat overlap at ${viewport.width}: ${i}, ${j}`,
          );
        }
      assert.equal(
        await display.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.ok(
        boxes.every((b) => b.bottom <= viewport.height),
        `Seats exceed ${viewport.width}×${viewport.height}`,
      );
      await display.screenshot({
        path: `test-artifacts/compact-${shape}-${viewport.width}.png`,
      });
    }
  }
  await expect(display.locator("button, select, input")).toHaveCount(0);
  await display.reload();
  await expect(display.locator(".compact-seats")).toBeVisible();
  // Real timer expiry leaves the saved event and editable scorecard unchanged.
  await expect(guest.getByRole("timer")).toHaveText("0:00", { timeout: 35000 });
  await expect(guest.locator(".round-clock")).toContainText("Time’s up");
  assert.equal((await read()).phase, "tasting");
  assert.equal((await read()).unlocked, 1);
  await guest.getByRole("button", { name: "8.0", exact: true }).click();
  await expect(guest.locator(".save-state.confirmed")).toBeVisible();
  await expect(
    recovered.getByRole("spinbutton", { name: "Your rating" }),
  ).toHaveValue("8");
  await host.getByRole("button", { name: "Stop timer", exact: true }).click();
  for (const page of [host, guest, display])
    await expect(page.getByRole("timer")).toHaveCount(0);
  for (const page of [host, guest, display]) {
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      scan.violations.map((v) => v.id),
      [],
    );
  }
  await host.screenshot({
    path: "test-artifacts/host-correction-history.png",
    fullPage: true,
  });
  for (let r = 2; r <= 8; r++) await control("unlock");
  await control("lock", { override: true });
  await control("reveal");
  await expect(
    host.getByText("Correct pouring order", { exact: true }),
  ).toHaveCount(0);
  await expect(
    guest.locator(".personal-answer strong").filter({ hasText: "Grenache" }),
  ).toBeVisible();
  await expect(display.locator(".table-map")).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: confirmed private correction/history, single-use link and same-seat browser recovery, persistent synchronized timer/real expiry, 20 long-name guests in three shapes at 1920×1080/1280×720/1024×768, automatic read-only layout, no seat overlap or overflow, accessibility, corrected reveal and lock compatibility.",
  );
} finally {
  await browser.close();
}
