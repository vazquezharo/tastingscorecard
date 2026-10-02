import { openOptionalAvatar } from "./browser-helpers";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { choices } from "../src/shared.ts";
import { mkdirSync } from "node:fs";
const origin = process.env.TEST_URL || "http://127.0.0.1:3016";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const hc = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const contexts = await Promise.all(
    [1, 2].map(() =>
      browser.newContext({ viewport: { width: 390, height: 844 } }),
    ),
  );
  const dc = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const host = await hc.newPage(),
    guests = await Promise.all(contexts.map((c) => c.newPage())),
    display = await dc.newPage();
  const errors: string[] = [];
  [host, ...guests, display].forEach((p) =>
    p.on("pageerror", (e) => errors.push(e.message)),
  );
  await host.goto(origin + "/host");
  await host.getByLabel("Host password").fill(process.env.HOST_PASSWORD!);
  await host
    .getByRole("button", { name: "Open host controls", exact: true })
    .click();
  await host.getByLabel("Name your evening").fill("Demo · seating test");
  await host.getByRole("button", { name: "Create event", exact: true }).click();
  await host.waitForURL(/\/host\/e\//);
  const id = host.url().split("/").at(-1)!;
  const path = `${origin}/api/events/${id}`;
  const read = async () => (await hc.request.get(path + "?host=1")).json();
  const control = async (action: string, extra = {}, expected = 200) => {
    const e = await read();
    const response = await hc.request.post(path + "/control", {
      headers: { Origin: origin },
      data: { action, revision: e.controlRevision, ...extra },
    });
    assert.equal(response.status(), expected);
    return response;
  };
  for (let i = 0; i < guests.length; i++) {
    await guests[i].goto(`${origin}/e/${id}`);
    await guests[i].getByLabel("Your name").fill(i ? "Blair" : "Alex");
    await openOptionalAvatar(guests[i]);
    await guests[i].locator(".drawing-surface").click();
    await guests[i]
      .getByRole("button", { name: "Take my seat", exact: true })
      .click();
  }
  await host
    .getByRole("button", { name: "View Blair’s scorecard", exact: true })
    .waitFor();
  await host.getByText("Arrange table", { exact: true }).click();
  const editor = host.locator(".seating-editor");
  await editor
    .getByLabel("Seat 1", { exact: true })
    .locator("option", { hasText: "Alex" })
    .waitFor({ state: "attached" });
  const e = await read();
  const [a, b] = e.tableGuests;
  await editor.getByLabel("Table shape").selectOption("rectangle");
  await editor.getByLabel("Seat 1", { exact: true }).selectOption(a.id);
  await editor.getByLabel("Seat 7", { exact: true }).selectOption(b.id);
  await editor.getByRole("button", { name: "Save seating" }).click();
  await editor.getByText("Seating saved.", { exact: true }).waitFor();
  await host.reload();
  await host.getByText("Arrange table", { exact: true }).click();
  assert.equal(
    await editor.getByLabel("Seat 1", { exact: true }).inputValue(),
    a.id,
  );
  assert.equal(
    await editor.getByLabel("Table shape").inputValue(),
    "rectangle",
  );
  assert.equal(
    await host.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const scan = await new AxeBuilder({ page: host })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  await control(
    "seating",
    { seating: { shape: "round", seats: [a.id, a.id] } },
    400,
  );
  await control(
    "seating",
    { seating: { shape: "triangle", seats: [a.id, null] } },
    400,
  );
  await control(
    "seating",
    { seating: { shape: "round", seats: ["unknown", null] } },
    400,
  );
  assert.equal(
    (
      await contexts[0].request.post(path + "/control", {
        headers: { Origin: origin },
        data: {
          action: "seating",
          revision: (await read()).controlRevision,
          seating: { shape: "square", seats: [a.id, null] },
        },
      })
    ).status(),
    401,
  );
  await control("key", { key: choices });
  await control("start");
  await display.goto(`${origin}/projector/e/${id}`);
  // Correct display route is discovered from the host link below if needed.
  if (!(await display.locator(".table-display").count())) {
    const href = await host
      .getByRole("link", { name: "Open Event Display" })
      .getAttribute("href");
    await display.goto(origin + href);
  }
  await display
    .getByRole("heading", { name: "0 / 2 ready for round 1" })
    .waitFor();
  for (const guest of guests) await guest.locator("#guess-1").waitFor();
  await guests[0].locator("#guess-1").selectOption(choices[0]);
  await guests[0].getByRole("button", { name: "8.0", exact: true }).click();
  await guests[0].locator("#notes-1").fill("Private cocoa note");
  await guests[0]
    .locator(".round-card:not([hidden]) .save-state.confirmed")
    .waitFor();
  await display
    .getByRole("heading", { name: "1 / 2 ready for round 1" })
    .waitFor();
  const pub = await (await dc.request.get(path + "?view=projector")).json();
  assert.deepEqual(
    Object.keys(pub.tableGuests[0]).sort(),
    ["avatar", "emoji", "id", "name", "ready"].sort(),
  );
  assert.equal(pub.key, undefined);
  assert.equal(pub.roster, undefined);
  assert.equal(JSON.stringify(pub).includes("Private cocoa note"), false);
  assert.equal(JSON.stringify(pub).includes("St. Francis"), false);
  await guests[0].locator("#guess-1").selectOption("");
  await display
    .getByRole("heading", { name: "0 / 2 ready for round 1" })
    .waitFor();
  await guests[1].locator("#guess-1").selectOption(choices[1]);
  await guests[1].getByRole("button", { name: "7.0", exact: true }).click();
  await display
    .getByRole("heading", { name: "1 / 2 ready for round 1" })
    .waitFor();
  await control("unlock");
  await display
    .getByRole("heading", { name: "0 / 2 ready for round 2" })
    .waitFor();
  for (const name of [
    "Casey",
    "Morgan",
    "Priya",
    "Jordan",
    "Diego",
    "Maya",
    "Sam",
    "Taylor",
    "Chris",
    "Jamie",
  ]) {
    const response = await dc.request.post(path + "/join", {
      headers: { Origin: origin, "X-Guest-Token": crypto.randomUUID() },
      data: {
        name,
        avatar: [
          {
            color: "#d6ad69",
            points: [
              [20, 20],
              [70, 70],
            ],
          },
        ],
      },
    });
    assert.equal(response.status(), 200);
  }
  const seatIds = (await read()).tableGuests.map((g: { id: string }) => g.id);
  // Eight-seat rectangle: four above and four below, with no head seats.
  await control("seating", {
    seating: { shape: "rectangle", seats: seatIds.slice(0, 8) },
  });
  await display.waitForFunction(
    () =>
      document.querySelectorAll(".table-rectangle .table-seat").length === 8,
  );
  const rectangle = await display.locator(".table-rectangle").evaluate((el) => {
    const table = el.querySelector(".table-surface")!.getBoundingClientRect();
    return {
      table: {
        left: table.left,
        right: table.right,
        top: table.top,
        bottom: table.bottom,
      },
      seats: Array.from(el.querySelectorAll(".table-seat")).map((seat) => {
        const r = seat.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }),
    };
  });
  assert.equal(
    rectangle.seats.filter((s) => s.bottom <= rectangle.table.top).length,
    4,
  );
  assert.equal(
    rectangle.seats.filter((s) => s.top >= rectangle.table.bottom).length,
    4,
  );
  assert.ok(
    rectangle.seats.every(
      (s) => s.bottom <= rectangle.table.top || s.top >= rectangle.table.bottom,
    ),
    "No rectangular head seats",
  );
  assert.ok(rectangle.seats[0].left < rectangle.seats[3].left);
  assert.ok(rectangle.seats[4].left > rectangle.seats[7].left);
  for (const shape of ["round", "square", "rectangle"]) {
    await control("seating", { seating: { shape, seats: seatIds } });
    await display.locator(`.table-${shape}`).waitFor();
    await display.reload();
    await display.locator(`.table-${shape}`).waitFor();
    const boxes = await display.locator(".table-seat").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    assert.equal(boxes.length, 12);
    console.log(shape, Math.max(...boxes.map((b) => b.y + b.h)));
    mkdirSync("test-artifacts/seating", { recursive: true });
    await display.screenshot({
      path: `test-artifacts/seating/${shape}-full.png`,
      fullPage: true,
    });
    assert.ok(
      boxes.every((b) => b.y + b.h <= 1080 && b.x >= 0 && b.x + b.w <= 1920),
      `${shape}: seats must fit TV`,
    );
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        assert.ok(
          a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y,
          `${shape}: overlapping seats ${i + 1}/${j + 1}`,
        );
      }
    mkdirSync("test-artifacts/seating", { recursive: true });
    await display.screenshot({
      path: `test-artifacts/seating/${shape}.png`,
      fullPage: true,
    });
  }
  await control("seating", {
    seating: { shape: "round", seats: [a.id, null] },
  });
  await display
    .getByRole("heading", { name: "Guests without a seat assignment" })
    .waitFor();
  assert.ok(
    (await display.locator(".unseated-guests").innerText()).includes("Blair"),
  );
  await control("remove", { participantId: a.id, confirm: a.name });
  assert.deepEqual((await read()).seating.seats, [null, null]);
  while ((await read()).unlocked < 8) await control("unlock");
  await control("lock", { override: true });
  await display.locator(".table-display").waitFor({ state: "detached" });
  await control("reveal");
  await display.getByText("St. Francis", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: host/mobile editing, 2 guests, permissions, privacy, readiness, sequential rounds, all 3 shapes, refresh, unseated guests, removal, lock/reveal, axe and console.",
  );
} finally {
  await browser.close();
}
