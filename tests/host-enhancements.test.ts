import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
import { makeStore } from "../server/store.ts";
import { publicEvent } from "../server/results.ts";
import { choices, timerRemaining } from "../src/shared.ts";

test("host corrections, seat recovery and timers preserve scorecards and secrecy", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "host-tools-test-"));
  process.env.SQLITE_PATH = join(dir, "test.sqlite");
  process.env.HOST_PASSWORD = "host-tools-test-password";
  process.env.SESSION_SECRET = "host-tools-test-secret-with-over-32-characters";
  delete process.env.DATABASE_URL;
  delete process.env.NODE_ENV;
  delete process.env.VERCEL;
  let store = makeStore();
  let server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  let origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let cookie = "";
  const token = randomUUID(),
    recoveredToken = randomUUID();
  async function call(
    path: string,
    method = "GET",
    data?: unknown,
    guest?: string,
    host = false,
  ) {
    const response = await fetch(origin + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(guest ? { "X-Guest-Token": guest } : {}),
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
    const name = "Demo · host tools";
    const created = await call(
      "/host/events",
      "POST",
      { name },
      undefined,
      true,
    );
    const id = created.body.id,
      path = `/events/${id}`;
    const joined = await call(
      path + "/join",
      "POST",
      {
        name: "Alex",
        avatar: [{ color: "#d6ad69", points: [[10, 10]] }],
      },
      token,
    );
    assert.equal(joined.status, 200);
    const participantId = joined.body.me.id;
    async function control(
      action: string,
      extra = {},
      status = 200,
      host = true,
    ) {
      const e = (
        await call(path + "?host=1", "GET", undefined, undefined, true)
      ).body;
      const result = await call(
        path + "/control",
        "POST",
        { action, revision: e.controlRevision, ...extra },
        undefined,
        host,
      );
      assert.equal(result.status, status, JSON.stringify(result.body));
      return result.body;
    }
    await t.test(
      "timer validation and host permission before tasting",
      async () => {
        await control("timerStart", { seconds: 30 }, 401, false);
        await control("timerStart", { seconds: 30 }, 423);
        await control(
          "correctKey",
          { key: [...choices], confirm: name, reason: "Swapped bottles" },
          423,
        );
      },
    );
    await control("key", { key: [...choices] });
    await control("start");
    await call(
      path + "/entries/1",
      "PUT",
      {
        guess: choices[0],
        rating: 7.3,
        notes: "Private saved note",
        revision: 0,
      },
      token,
    );
    await t.test(
      "explicit correction validates, records private history and preserves every entry",
      async () => {
        const swapped = [choices[1], choices[0], ...choices.slice(2)];
        const input = {
          key: swapped,
          reason: "PRIVATE bottles swapped",
          confirm: name,
        };
        await control("correctKey", input, 401, false);
        await control("key", { key: swapped }, 423);
        await control("correctKey", { ...input, confirm: "wrong" }, 400);
        await control("correctKey", { ...input, revision: -1 }, 409);
        await control("correctKey", { ...input, reason: " " }, 400);
        await control(
          "correctKey",
          { ...input, key: Array(8).fill(choices[0]) },
          400,
        );
        const before = (await store.get(id))!;
        const corrected = await control("correctKey", input);
        const after = (await store.get(id))!;
        assert.deepEqual(after.participants, before.participants);
        assert.equal(after.phase, before.phase);
        assert.equal(after.unlocked, before.unlocked);
        assert.equal(after.generation, before.generation);
        assert.deepEqual(after.keyCorrections?.[0].before, [...choices]);
        assert.deepEqual(corrected.key, swapped);
        await control("correctKey", input, 400);
        for (const view of [
          await call(path),
          await call(path, "GET", undefined, token),
          await call(path + "?view=projector", "GET", undefined, token),
        ]) {
          assert.equal(view.body.key, undefined);
          assert.equal(view.body.keyCorrections, undefined);
          assert.ok(!JSON.stringify(view.body).includes(input.reason));
        }
      },
    );
    await t.test(
      "host recovery links preserve identity and existing sessions",
      async () => {
        const before = (await store.get(id))!.participants[0];
        assert.equal(
          (
            await call(
              path + "/recovery-link",
              "POST",
              { participantId },
              token,
            )
          ).status,
          401,
        );
        const response = await call(
          path + "/recovery-link",
          "POST",
          { participantId },
          undefined,
          true,
        );
        assert.equal(response.status, 200);
        const secret = response.body.path.split("#recover=")[1];
        assert.equal(
          (
            await call(
              path + "/recovery-link/redeem",
              "POST",
              { secret },
              recoveredToken,
            )
          ).status,
          200,
        );
        const recovered = await call(path, "GET", undefined, recoveredToken);
        assert.equal(recovered.body.me.id, participantId);
        assert.deepEqual(recovered.body.me.entries, before.entries);
        assert.equal(
          (
            await call(
              path + "/recovery-link/redeem",
              "POST",
              { secret },
              randomUUID(),
            )
          ).status,
          410,
        );
        for (const guest of [token, recoveredToken])
          assert.equal(
            (await call(path, "GET", undefined, guest)).body.me.id,
            participantId,
          );
      },
    );
    await t.test(
      "persistent timer pause/resume/expiry never submits, locks or advances",
      async () => {
        for (const seconds of [0, 29, 3601, 30.5, "30"])
          await control("timerStart", { seconds }, 400);
        const started = await control("timerStart", { seconds: 30 });
        assert.equal(started.roundTimer.round, 1);
        assert.ok(started.roundTimer.endsAt > started.serverTime);
        assert.deepEqual(
          (await call(path)).body.roundTimer,
          started.roundTimer,
        );
        await control("timerPause", {}, 401, false);
        await control("timerPause", { revision: -1 }, 409);
        const paused = await control("timerPause");
        assert.equal(paused.roundTimer.endsAt, undefined);
        assert.ok(
          paused.roundTimer.remainingMs > 0 &&
            paused.roundTimer.remainingMs <= 30000,
        );
        assert.equal(
          timerRemaining(paused.roundTimer, Date.now() + 100000),
          paused.roundTimer.remainingMs,
        );
        await control("timerPause", {}, 400);
        await control("timerResume");
        await control("timerResume", {}, 400);
        await store.mutate(id, (e) => {
          e.roundTimer!.endsAt = Date.now() - 1000;
        });
        const expired = (await store.get(id))!;
        assert.equal(timerRemaining(expired.roundTimer!, Date.now()), 0);
        assert.equal(expired.phase, "tasting");
        assert.equal(expired.unlocked, 1);
        assert.equal(expired.participants[0].submitted, false);
        await control("timerPause", {}, 400);
        assert.equal(
          (
            await call(
              path + "/entries/1",
              "PUT",
              {
                guess: choices[0],
                rating: 8.1,
                notes: "Still editable",
                revision: 1,
              },
              token,
            )
          ).status,
          200,
        );
        await control("timerStart", { seconds: 120 });
        await new Promise<void>((r) => server.close(() => r()));
        await store.close();
        store = makeStore();
        server = createApp(store).listen(0, "127.0.0.1");
        await new Promise<void>((r) => server.once("listening", r));
        origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
        assert.equal((await store.get(id))!.keyCorrections?.length, 1);
        assert.equal((await call(path)).body.roundTimer.durationMs, 120000);
        await control("unlock");
        assert.equal((await call(path)).body.roundTimer, undefined);
        await control("timerStart", { seconds: 60 });
        await control("timerStop");
        assert.equal((await call(path)).body.roundTimer, undefined);
      },
    );
    await t.test(
      "pre-reveal lock allows correction; first reveal permanently closes it",
      async () => {
        for (let r = 3; r <= 8; r++) await control("unlock");
        await control("timerStart", { seconds: 30 });
        await control("lock", { override: true });
        assert.equal((await call(path)).body.roundTimer, undefined);
        await control("timerStart", { seconds: 30 }, 423);
        assert.equal(
          (
            await call(
              path + "/recovery-link",
              "POST",
              { participantId },
              undefined,
              true,
            )
          ).status,
          200,
        );
        assert.equal((await call(path)).body.phase, "locked");
        await control("correctKey", {
          key: [...choices],
          confirm: name,
          reason: "Confirmed original order",
        });
        await control("reveal");
        await control(
          "correctKey",
          {
            key: [choices[1], choices[0], ...choices.slice(2)],
            confirm: name,
            reason: "Too late",
          },
          423,
        );
        for (const view of [
          publicEvent((await store.get(id))!),
          (await call(path + "?view=projector")).body,
        ])
          assert.equal(view.keyCorrections, undefined);
      },
    );
    await t.test(
      "explicit reset clears timer while retaining correction history and seats",
      async () => {
        const raw = (await store.get(id))!;
        // Restore a local unrevealed fixture to exercise the existing reset rule.
        await store.mutate(id, (e) => {
          e.revealed = 0;
          e.phase = "tasting";
          e.seating = { shape: "round", seats: [participantId, null] };
        });
        await control("timerStart", { seconds: 30 });
        await control("reset", { confirm: name });
        const reset = (await store.get(id))!;
        assert.equal(reset.roundTimer, undefined);
        assert.deepEqual(reset.keyCorrections, raw.keyCorrections);
        assert.deepEqual(reset.seating?.seats, [participantId, null]);
        assert.deepEqual(reset.participants[0].entries, {});
      },
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
