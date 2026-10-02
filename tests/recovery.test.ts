import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.ts";
import { makeStore } from "../server/store.ts";
import { choices } from "../src/shared.ts";

test("PIN recovery preserves a seat across browsers, lock and restart without leaking credentials", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tasting-recovery-"));
  process.env.SQLITE_PATH = join(dir, "test.sqlite");
  process.env.HOST_PASSWORD = "recovery-test-password";
  process.env.SESSION_SECRET = "recovery-test-secret-over-32-characters";
  delete process.env.DATABASE_URL;
  delete process.env.NODE_ENV;
  let store = makeStore(),
    server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  let origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    cookie = "";
  const tokens = [randomUUID(), randomUUID(), randomUUID()];
  async function call(
    path: string,
    method = "GET",
    data?: unknown,
    token?: string,
    host = false,
  ) {
    if (
      path.endsWith("/join") &&
      data &&
      typeof data === "object" &&
      !("avatar" in data)
    ) {
      data = {
        ...data,
        avatar: [
          {
            color: "#d6ad69",
            points: [
              [20, 20],
              [70, 70],
            ],
          },
        ],
      };
    }
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
    let e = (
      await call(
        "/host/events",
        "POST",
        { name: "Demo recovery" },
        undefined,
        true,
      )
    ).body;
    const path = `/events/${e.id}`;
    const joined = await call(
      path + "/join",
      "POST",
      {
        name: "Alex",
        pin: "4826",
        avatar: [
          {
            color: "#d6ad69",
            points: [
              [10, 10],
              [80, 80],
            ],
          },
        ],
      },
      tokens[0],
    );
    assert.equal(joined.status, 200);
    const seat = joined.body.me.id;
    assert.equal(joined.body.me.recoveryEnabled, true);
    assert.equal(joined.body.me.recoveryHash, undefined);
    assert.equal(joined.body.me.tokenAliases, undefined);
    assert.equal(joined.body.me.tokenHash, undefined);
    assert.equal(
      (
        await call(
          path + "/recover",
          "POST",
          { name: "Alex", pin: "0000" },
          tokens[1],
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await call(
          path + "/recover",
          "POST",
          { name: "Unknown", pin: "4826" },
          tokens[1],
        )
      ).status,
      401,
    );
    async function control(action: string, extra = {}) {
      e = (await call(path + "?host=1", "GET", undefined, undefined, true))
        .body;
      const r = await call(
        path + "/control",
        "POST",
        { action, revision: e.controlRevision, ...extra },
        undefined,
        true,
      );
      assert.equal(r.status, 200);
    }
    await control("key", { key: choices });
    await control("start");
    assert.equal(
      (
        await call(
          path + "/entries/1",
          "PUT",
          {
            guess: choices[0],
            rating: 8.2,
            notes: "Private recovery note",
            revision: 0,
          },
          tokens[0],
        )
      ).status,
      200,
    );
    const recovered = await call(
      path + "/recover",
      "POST",
      { name: " alex ", pin: "4826" },
      tokens[1],
    );
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.me.id, seat);
    assert.equal(recovered.body.participants, 1);
    assert.equal(recovered.body.me.entries[1].rating, 8.2);
    assert.equal(recovered.body.me.avatar.length, 1);
    assert.equal(
      (await call(path, "GET", undefined, tokens[0])).body.me.id,
      seat,
    );
    assert.equal(
      (await call(path + "/join", "POST", { name: "Other name" }, tokens[1]))
        .body.participants,
      1,
    );
    assert.equal(
      (await call(path + "/join", "POST", { name: "Blair" }, tokens[2])).status,
      200,
    );
    assert.equal(
      (
        await call(
          path + "/recover",
          "POST",
          { name: "Alex", pin: "4826" },
          tokens[2],
        )
      ).status,
      409,
    );
    assert.equal(
      (await call(path + "/pin", "PUT", { pin: "123" }, tokens[0])).status,
      400,
    );
    assert.equal(
      (await call(path + "/pin", "PUT", { pin: "5731" }, tokens[2])).status,
      200,
    );
    for (let r = 2; r <= 8; r++) {
      await control("unlock");
      assert.equal(
        (
          await call(
            path + `/entries/${r}`,
            "PUT",
            { guess: choices[r - 1], rating: 8.2, notes: "", revision: 0 },
            tokens[0],
          )
        ).status,
        200,
      );
    }
    assert.equal(
      (await call(path + "/submit", "POST", {}, tokens[0])).status,
      200,
    );
    await control("lock", { override: true });
    const newToken = randomUUID();
    assert.equal(
      (
        await call(
          path + "/recover",
          "POST",
          { name: "Alex", pin: "4826" },
          newToken,
        )
      ).body.me.id,
      seat,
    );
    assert.equal(
      (
        await call(
          path + "/entries/1",
          "PUT",
          { guess: choices[0], rating: 9, notes: "", revision: 1 },
          newToken,
        )
      ).status,
      423,
    );
    const publicData = (await call(path + "?view=projector")).body;
    assert.equal(publicData.me, undefined);
    assert.equal(publicData.results[0].wine, undefined);
    assert.equal(JSON.stringify(publicData).includes("recoveryHash"), false);
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
    store = makeStore();
    server = createApp(store).listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const after = (
      await call(
        path + "/recover",
        "POST",
        { name: "Alex", pin: "4826" },
        randomUUID(),
      )
    ).body;
    assert.equal(after.me.id, seat);
    assert.equal(after.me.entries[1].notes, "Private recovery note");
    assert.equal(after.participants, 2);
    for (let i = 0; i < 20; i++)
      await call(
        path + "/recover",
        "POST",
        { name: "Alex", pin: "0000" },
        randomUUID(),
      );
    assert.equal(
      (
        await call(
          path + "/recover",
          "POST",
          { name: "Alex", pin: "0000" },
          randomUUID(),
        )
      ).status,
      429,
    );
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
    store = makeStore();
    server = createApp(store).listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    assert.equal(
      (
        await call(
          path + "/recover",
          "POST",
          { name: "Alex", pin: "4826" },
          randomUUID(),
        )
      ).status,
      429,
    );
    assert.equal(
      (await call(path + "/pin", "PUT", { pin: "8642" }, tokens[0])).status,
      200,
    );
    assert.equal(
      (
        await call(
          path + "/recover",
          "POST",
          { name: "Alex", pin: "8642" },
          randomUUID(),
        )
      ).body.me.id,
      seat,
    );
    for (let r = 1; r <= 8; r++) {
      if (r > 1) await control("next");
      await control("reveal");
    }
    await control("summary");
    const beforeRemoval = (await call(path)).body;
    assert.equal(beforeRemoval.results[0].average, 8.2);
    assert.equal(beforeRemoval.summary.leaderboard[0].score, 8);
    const latest = (
      await call(path + "?host=1", "GET", undefined, undefined, true)
    ).body;
    const remove = {
      action: "remove",
      participantId: seat,
      confirm: "Alex",
      revision: latest.controlRevision,
    };
    assert.equal(
      (await call(path + "/control", "POST", remove, tokens[0])).status,
      401,
    );
    assert.equal(
      (
        await call(
          path + "/control",
          "POST",
          { ...remove, confirm: "wrong" },
          undefined,
          true,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          path + "/control",
          "POST",
          { ...remove, revision: -1 },
          undefined,
          true,
        )
      ).status,
      409,
    );
    const removed = await call(
      path + "/control",
      "POST",
      remove,
      undefined,
      true,
    );
    assert.equal(removed.status, 200);
    assert.equal(removed.body.participants, 1);
    assert.equal(removed.body.results[0].guesses.length, 1);
    assert.equal(removed.body.results[0].count, 0);
    assert.equal(removed.body.results[0].average, null);
    assert.deepEqual(
      removed.body.summary.leaderboard.map((p: { name: string }) => p.name),
      ["Blair"],
    );
    const exported = await fetch(origin + "/api" + path + "/export", {
      headers: { Cookie: cookie },
    });
    assert.equal(exported.status, 200);
    const csv = await exported.text();
    assert.equal(csv.includes("Blair"), true);
    assert.equal(csv.includes("Alex"), false);
    assert.equal(csv.includes("Private recovery note"), false);
    assert.equal(
      (await call(path, "GET", undefined, tokens[0])).body.me,
      undefined,
    );
    assert.equal(
      (await call(path, "GET", undefined, tokens[1])).body.me,
      undefined,
    );
    assert.equal(
      (
        await call(
          path + "/recover",
          "POST",
          { name: "Alex", pin: "8642" },
          randomUUID(),
        )
      ).status,
      401,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
