import { chromium, request } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { choices } from "../src/shared.ts";
const origin = process.env.TEST_URL || "http://127.0.0.1:3038";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const api = await request.newContext({
  baseURL: origin,
  extraHTTPHeaders: { Origin: origin },
});
assert.equal(
  (
    await api.post("/api/host/login", {
      data: { password: "local-rehearsal-only" },
    })
  ).status(),
  200,
);
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
mkdirSync("test-artifacts/dynamic-table", { recursive: true });
const errors: string[] = [];
const widths: Record<number, number> = {};
try {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const display = await context.newPage();
  display.on("pageerror", (e) => errors.push(e.message));
  let writes = 0;
  display.on("request", (r) => {
    if (r.url().includes("/api/") && r.method() !== "GET") writes++;
  });
  for (const count of (process.env.TEST_COUNTS || "4,6,8,12,20")
    .split(",")
    .map(Number)) {
    const event = await (
        await api.post("/api/host/events", {
          data: { name: `Fictional · ${count} guests` },
        })
      ).json(),
      path = `/api/events/${event.id}`;
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const response = await api.post(path + "/join", {
        headers: { "X-Guest-Token": crypto.randomUUID() },
        data: {
          name:
            count === 20
              ? `Guest ${i + 1} · Long fictional tasting name`
              : [
                  "Alex",
                  "Blair",
                  "Jordan",
                  "Sam",
                  "Casey",
                  "Taylor",
                  "Chris",
                  "Jamie",
                ][i] || `Guest ${i + 1}`,
        },
      });
      assert.equal(response.status(), 200, await response.text());
      const joined = await response.json();
      ids.push(joined.me.id);
    }
    const control = async (action: string, extra = {}) => {
      const latest = await (await api.get(path + "?host=1")).json();
      const r = await api.post(path + "/control", {
        data: { action, revision: latest.controlRevision, ...extra },
      });
      assert.equal(r.status(), 200);
    };
    await control("seating", { seating: { shape: "rectangle", seats: ids } });
    await control("key", { key: choices });
    await control("start");
    for (const [width, height] of [
      [1920, 1080],
      [1280, 720],
      [1024, 768],
    ]) {
      await display.setViewportSize({ width, height });
      await display.goto(origin + `/display/e/${event.id}`);
      await display
        .locator(".table-seat")
        .nth(count - 1)
        .waitFor();
      const geometry = await display
        .locator(".table-rectangle")
        .evaluate((el) => {
          const surface = el
            .querySelector(".table-surface")!
            .getBoundingClientRect();
          const seats = Array.from(el.querySelectorAll(".table-seat")).map(
            (s) => {
              const box = s.getBoundingClientRect();
              return {
                x: box.x,
                y: box.y,
                w: box.width,
                h: box.height,
                nameSize: parseFloat(
                  getComputedStyle(s.querySelector("strong")!).fontSize,
                ),
                name: s.textContent,
                overflow:
                  (s as HTMLElement).scrollWidth >
                  (s as HTMLElement).clientWidth,
              };
            },
          );
          return {
            surface: {
              x: surface.x,
              y: surface.y,
              w: surface.width,
              h: surface.height,
            },
            seats,
            controls: el.querySelectorAll("button,input,select").length,
          };
        });
      assert.equal(geometry.seats.length, count);
      assert.equal(geometry.controls, 0);
      assert.equal(
        geometry.seats.filter((s) => s.y + s.h <= geometry.surface.y).length,
        Math.ceil(count / 2),
      );
      assert.equal(
        geometry.seats.filter(
          (s) => s.y >= geometry.surface.y + geometry.surface.h,
        ).length,
        Math.floor(count / 2),
      );
      assert.ok(
        geometry.seats.every(
          (s) => s.x >= 0 && s.x + s.w <= width && !s.overflow,
        ),
        `${count} seats at ${width}: horizontal overflow`,
      );
      for (let i = 0; i < count; i++)
        for (let j = i + 1; j < count; j++) {
          const a = geometry.seats[i],
            b = geometry.seats[j];
          assert.ok(
            a.x + a.w <= b.x + 0.1 ||
              b.x + b.w <= a.x + 0.1 ||
              a.y + a.h <= b.y + 0.1 ||
              b.y + b.h <= a.y + 0.1,
            "No overlapping seats",
          );
        }
      if (Math.max(...geometry.seats.map((s) => s.y + s.h)) > height) {
        await display.screenshot({
          path: `test-artifacts/dynamic-table/overflow-${count}-${width}.png`,
          fullPage: true,
        });
        console.log(JSON.stringify({ width, height, geometry }));
      }
      assert.ok(
        Math.max(...geometry.seats.map((s) => s.y + s.h)) <= height,
        `${count} seats at ${width}: table must fit screen`,
      );
      if (width === 1920) widths[count] = geometry.seats[0].w;
      if (count === 8 || count === 20)
        await display.screenshot({
          path: `test-artifacts/dynamic-table/${count}-guests-${width}.png`,
          fullPage: true,
        });
    }
    if (count === 8) {
      await display.setViewportSize({ width: 1920, height: 1080 });
      const before = await (await api.get(path + "?host=1")).json();
      await display.reload();
      await display.locator(".table-seat").nth(7).waitFor();
      assert.equal(
        (await (await api.get(path + "?host=1")).json()).revision,
        before.revision,
      );
      // Empty saved slots collapse without moving remaining guests to a different side or renumbering them.
      await control("remove", { participantId: ids[0], confirm: "Alex" });
      await display.waitForFunction(
        () => document.querySelectorAll(".table-seat").length === 7,
      );
      assert.equal(
        await display.locator(".table-side-top .table-seat").count(),
        3,
      );
      assert.equal(
        await display.locator(".table-side-bottom .table-seat").count(),
        4,
      );
      assert.ok(
        (await display.locator(".table-side-top").textContent())!.includes(
          "Seat 2",
        ),
      );
      assert.ok(
        !(await display.locator(".table-side-top").textContent())!.includes(
          "Seat 5",
        ),
      );
      const after = await (await api.get(path + "?host=1")).json();
      assert.equal(after.seating.seats[0], null);
      assert.equal(after.seating.seats.length, 8);
    }
  }
  if (!process.env.TEST_COUNTS)
    assert.ok(
      widths[4] > widths[6] &&
        widths[6] > widths[8] &&
        widths[8] > widths[12] &&
        widths[12] > widths[20],
    );
  assert.equal(writes, 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      seatWidths: widths,
      checks: [
        "4/6/8/12/20 guests at 1920×1080, 1280×720 and 1024×768",
        "larger cards for fewer guests",
        "two long sides/no heads",
        "no overlap or overflow",
        "removal collapses gaps without changing saved seats or sides",
        "read-only display and refresh",
      ],
    }),
  );
} finally {
  await browser.close();
  await api.dispose();
}
