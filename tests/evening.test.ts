import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createApp } from "../server/app.ts";
import { makeStore } from "../server/store.ts";
import { publicEvent } from "../server/results.ts";
import { choices } from "../src/shared.ts";
import { tasteInsights } from "../src/taste-insights.ts";

test("bottle uploads and persisted timed reveals enforce secrecy, permissions and old-event compatibility", async () => {
  const dir = mkdtempSync(join(tmpdir(), "evening-test-"));
  process.env.SQLITE_PATH = join(dir, "test.sqlite");
  process.env.HOST_PASSWORD = "evening-test-password";
  process.env.SESSION_SECRET = "evening-test-secret-with-over-32-characters";
  delete process.env.DATABASE_URL;
  delete process.env.NODE_ENV;
  delete process.env.VERCEL;
  let store = makeStore();
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let cookie = "";
  async function call(
    path: string,
    method = "GET",
    data?: unknown,
    host = true,
  ) {
    const response = await fetch(origin + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(host ? { Cookie: cookie } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie"),
    };
  }
  try {
    cookie = (
      await call("/host/login", "POST", { password: process.env.HOST_PASSWORD })
    ).cookie!.split(";")[0];
    const event = (
      await call("/host/events", "POST", {
        name: "Demo · evening enhancements",
      })
    ).body;
    const path = `/events/${event.id}`;
    const jpeg = await sharp({
      create: { width: 160, height: 480, channels: 3, background: "#8c244b" },
    })
      .jpeg()
      .toBuffer();
    const photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    assert.equal(
      (
        await call(
          path + "/bottle",
          "PUT",
          { wine: choices[0], photo, revision: 0 },
          false,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await call(path + "/bottle", "PUT", {
          wine: choices[0],
          photo: "data:image/jpeg;base64,/9j/abcd",
          revision: 0,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call(path + "/bottle", "PUT", {
          wine: "Other",
          photo,
          revision: 0,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call(path + "/bottle", "PUT", {
          wine: choices[0],
          photo,
          revision: 0,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(path + "/bottle", "PUT", {
          wine: choices[0],
          photo,
          revision: 0,
        })
      ).status,
      409,
    );
    assert.ok((await call(path + "?host=1")).body.bottlePhotos[choices[0]]);
    assert.equal(
      (await call(path, "GET", undefined, false)).body.bottlePhotos,
      undefined,
    );
    await store.mutate(event.id, (e) => {
      e.key = [...choices];
      e.phase = "locked";
      e.unlocked = 8;
      e.presenting = 1;
    });
    assert.equal(
      (
        await call(path + "/bottle", "PUT", {
          wine: choices[0],
          photo,
          revision: 1,
        })
      ).status,
      423,
    );
    async function control(action: string, extra = {}) {
      const state = (await call(path + "?host=1")).body;
      return call(path + "/control", "POST", {
        action,
        revision: state.controlRevision,
        ...extra,
      });
    }
    assert.equal(
      (
        await call(
          path + "/control",
          "POST",
          { action: "reveal", revision: 1, countdown: true },
          false,
        )
      ).status,
      401,
    );
    assert.equal((await control("reveal", { countdown: "yes" })).status, 400);
    assert.equal((await control("reveal", { countdown: true })).status, 200);
    const hidden = (await call(path, "GET", undefined, false)).body;
    assert.equal(hidden.revealed, 0);
    assert.ok(hidden.revealCountdown.endsAt);
    assert.equal(hidden.results[0].wine, undefined);
    assert.equal(hidden.results[0].bottlePhoto, undefined);
    assert.equal(hidden.results[0].average, undefined);
    assert.equal(hidden.results[0].producer, undefined);
    assert.equal((await control("next")).status, 409);
    assert.equal((await control("summary")).status, 409);
    assert.equal((await control("reset", { confirm: event.name })).status, 423);
    await store.close();
    store = makeStore();
    const persisted = (await store.get(event.id))!;
    assert.equal(
      persisted.revealCountdown!.endsAt,
      hidden.revealCountdown.endsAt,
    );
    assert.ok(persisted.bottlePhotos![choices[0]]);
    assert.equal(publicEvent(persisted).revealed, 0);
    persisted.revealCountdown!.endsAt = Date.now() - 1;
    const opened = publicEvent(persisted);
    assert.equal(opened.revealed, 1);
    assert.equal(opened.results[0].wine, choices[0]);
    assert.ok(opened.results[0].bottlePhoto);
    assert.equal(opened.revealCountdown, undefined);
    delete persisted.revealCountdown;
    delete persisted.bottlePhotos;
    assert.equal(publicEvent(persisted).results[0].wine, choices[0]);
    assert.equal(
      publicEvent(persisted).results[0].bottlePhoto,
      `/api/events/${event.id}/bottle-photo/1`,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("taste insights use saved valid ratings, keep all tied favorites, and describe group eligibility", () => {
  const token = randomUUID();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const entries = Object.fromEntries(
    choices.map((guess, i) => [
      i + 1,
      { guess, rating: i < 2 ? 9 : 6, notes: "PRIVATE NOTE", revision: 1 },
    ]),
  );
  const event = {
    id: "fixture",
    name: "Night",
    phase: "summary" as const,
    key: [...choices],
    unlocked: 8,
    revealed: 8,
    presenting: 8,
    revision: 1,
    controlRevision: 1,
    generation: 0,
    createdAt: new Date().toISOString(),
    participants: [
      {
        id: "a",
        name: "Alex",
        emoji: "🍷",
        tokenHash,
        entries,
        submitted: true,
      },
      {
        id: "b",
        name: "Blair",
        emoji: "🍷",
        tokenHash: "other",
        entries: Object.fromEntries(
          choices.map((guess, i) => [
            i + 1,
            { guess, rating: 7, notes: "SECRET", revision: 1 },
          ]),
        ),
        submitted: true,
      },
    ],
  };
  assert.equal(tasteInsights(publicEvent(event)), null);
  const mine = tasteInsights(publicEvent(event, tokenHash))!;
  assert.equal(mine.favorites.length, 2);
  assert.equal(mine.high, 9);
  assert.equal(mine.low, 6);
  assert.equal(mine.rows[0].average, 8);
  assert.equal(mine.rows[0].difference, 1);
  assert.equal(mine.included, true);
  event.participants[0].submitted = false;
  const draft = tasteInsights(publicEvent(event, tokenHash))!;
  assert.equal(draft.included, false);
  assert.equal(draft.rows[0].average, 7);
  event.participants[1].submitted = false;
  assert.equal(
    tasteInsights(publicEvent(event, tokenHash))!.rows[0].difference,
    null,
  );
  event.participants[0].entries = {};
  assert.equal(tasteInsights(publicEvent(event, tokenHash))!.rows.length, 0);
});
