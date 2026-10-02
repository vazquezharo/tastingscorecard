import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
import { makeStore } from "../server/store.ts";
import { choices } from "../src/shared.ts";
import { csv, publicEvent, wineResult } from "../server/results.ts";

test("practice saves privately, survives restart/recovery, and never affects scored rounds", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tasting-practice-"));
  process.env.SQLITE_PATH = join(dir, "practice.sqlite");
  process.env.HOST_PASSWORD = "practice-test-password";
  process.env.SESSION_SECRET = "practice-test-secret-with-over-32-characters";
  delete process.env.DATABASE_URL;
  delete process.env.NODE_ENV;
  delete process.env.VERCEL;
  let store = makeStore();
  let server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  let origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let cookie = "";
  async function call(
    path: string,
    method = "GET",
    data?: unknown,
    token?: string,
    host = false,
  ) {
    const response = await fetch(origin + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Guest-Token": token } : {}),
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
    const created = await call(
      "/host/events",
      "POST",
      { name: "Demo · private practice" },
      undefined,
      true,
    );
    const path = `/events/${created.body.id}`;
    const token = randomUUID();
    await call(
      path + "/join",
      "POST",
      {
        name: "Alex",
        avatar: [{ color: "#d6ad69", points: [[10, 10]] }],
      },
      token,
    );
    const answer = {
      guess: choices[0],
      rating: 7.3,
      notes: "PRIVATE practice note",
      revision: 0,
    };
    assert.equal((await call(path + "/practice", "PUT", answer)).status, 401);
    assert.equal(
      (await call(path + "/practice", "PUT", answer, randomUUID())).status,
      401,
    );
    assert.equal(
      (
        await call(
          path + "/practice",
          "PUT",
          { ...answer, rating: 10.1 },
          token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          path + "/practice",
          "PUT",
          { ...answer, guess: "Unknown" },
          token,
        )
      ).status,
      400,
    );
    const saved = await call(path + "/practice", "PUT", answer, token);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.me.practice.rating, 7.3);
    assert.deepEqual(saved.body.me.entries, {});
    assert.equal(saved.body.me.submitted, false);
    assert.equal(saved.body.tableGuests[0].ready, false);
    assert.equal(
      (await call(path + "/practice", "PUT", answer, token)).status,
      409,
    );
    for (const view of [
      await call(path),
      await call(path, "GET", undefined, undefined, true),
    ]) {
      assert.ok(!JSON.stringify(view.body).includes("PRIVATE practice note"));
      assert.ok(!JSON.stringify(view.body).includes('"practice"'));
    }
    await new Promise<void>((r, reject) =>
      server.close((e) => (e ? reject(e) : r())),
    );
    await store.close();
    store = makeStore();
    server = createApp(store).listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const seat = (await call(path, "GET", undefined, token)).body.me.id;
    const recoveryToken = randomUUID();
    await call(
      path + "/recover",
      "POST",
      { participantId: seat },
      recoveryToken,
    );
    const request = (
      await call(path + "?host=1", "GET", undefined, undefined, true)
    ).body.recoveryRequests[0];
    assert.equal(
      (
        await call(
          path + `/recovery/${request.id}`,
          "POST",
          { decision: "approve" },
          undefined,
          true,
        )
      ).status,
      200,
    );
    const recovered = await call(path, "GET", undefined, recoveryToken);
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.me.practice.notes, answer.notes);
    async function control(action: string, extra = {}) {
      const e = await call(path + "?host=1", "GET", undefined, undefined, true);
      const result = await call(
        path + "/control",
        "POST",
        { action, revision: e.body.controlRevision, ...extra },
        undefined,
        true,
      );
      assert.equal(result.status, 200);
    }
    await control("key", { key: [...choices] });
    await control("start");
    assert.equal(
      (await call(path + "/practice", "PUT", { ...answer, revision: 1 }, token))
        .status,
      423,
    );
    let raw = (await store.get(created.body.id))!;
    assert.equal(publicEvent(raw).tableGuests[0].ready, false);
    assert.equal(wineResult(raw, 1, true).average, null);
    assert.ok(!csv(raw).includes(answer.notes));
    assert.equal(
      (await call(path + "/entries/0", "PUT", answer, token)).status,
      403,
    );
    const scored = await call(
      path + "/entries/1",
      "PUT",
      { ...answer, notes: "Real round" },
      token,
    );
    assert.equal(scored.status, 200);
    assert.equal(scored.body.tableGuests[0].ready, true);
    for (let r = 2; r <= 8; r++) await control("unlock");
    await control("lock", { override: true });
    assert.equal(
      (await call(path + "/practice", "PUT", { ...answer, revision: 1 }, token))
        .status,
      423,
    );
    await control("reset", { confirm: created.body.name });
    raw = (await store.get(created.body.id))!;
    assert.equal(raw.participants[0].practice, undefined);
    assert.deepEqual(raw.participants[0].entries, {});
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
