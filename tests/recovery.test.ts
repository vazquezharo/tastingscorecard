import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.ts";
import { makeStore } from "../server/store.ts";
import { choices } from "../src/shared.ts";

test("host-approved recovery and single-use links preserve seats, privacy, locking and persistent sessions", async (t) => {
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
  const original = randomUUID(),
    recovered = randomUUID(),
    other = randomUUID();
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
      body: response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : {},
      cookie: response.headers.get("set-cookie"),
    };
  }
  try {
    cookie = (
      await call("/host/login", "POST", { password: process.env.HOST_PASSWORD })
    ).cookie!.split(";")[0];
    const e = (
      await call(
        "/host/events",
        "POST",
        { name: "Demo · approved recovery" },
        undefined,
        true,
      )
    ).body;
    const path = `/events/${e.id}`;
    const joined = (
      await call(
        path + "/join",
        "POST",
        {
          name: "Alex",
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
        original,
      )
    ).body;
    const seat = joined.me.id;
    await call(path + "/join", "POST", { name: "Blair" }, other);
    const hostEvent = async () =>
      (await call(path + "?host=1", "GET", undefined, undefined, true)).body;
    async function control(action: string, extra = {}) {
      const latest = await hostEvent();
      const r = await call(
        path + "/control",
        "POST",
        { action, revision: latest.controlRevision, ...extra },
        undefined,
        true,
      );
      assert.equal(r.status, 200);
      return r.body;
    }
    const pending = async (token: string) => {
      const r = await call(
        path + "/recover",
        "POST",
        { participantId: seat },
        token,
      );
      assert.equal(r.status, 200);
      assert.equal(r.body.status, "pending");
      assert.equal(r.body.me, undefined);
      return (await hostEvent()).recoveryRequests.at(-1);
    };
    const decide = async (id: string, decision: string) =>
      call(path + `/recovery/${id}`, "POST", { decision }, undefined, true);
    const newLink = async () => {
      const r = await call(
        path + "/recovery-link",
        "POST",
        { participantId: seat },
        undefined,
        true,
      );
      assert.equal(r.status, 200);
      return r.body.path.split("#recover=")[1];
    };
    await control("seating", {
      seating: { shape: "round", seats: [seat, null] },
    });
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
            notes: "PRIVATE_RECOVERY_NOTE",
            revision: 0,
          },
          original,
        )
      ).status,
      200,
    );
    // Legacy hashes remain readable but can never authorize a PIN recovery.
    await store.mutate(e.id, (current) => {
      current.participants[0].recoveryHash = "legacy-pin-credential";
    });
    const before = structuredClone((await store.get(e.id))!.participants[0]);
    await t.test(
      "name selection stays pending; denial, host permissions, privacy and refresh",
      async () => {
        assert.equal(
          (
            await call(
              path + "/recover",
              "POST",
              { name: "Alex", pin: "4826" },
              recovered,
            )
          ).status,
          400,
        );
        assert.equal(
          (await call(path + "/pin", "PUT", { pin: "5731" }, original)).status,
          404,
        );
        assert.equal(
          (
            await call(
              path + "/control",
              "POST",
              {
                action: "resetPin",
                revision: (await hostEvent()).controlRevision,
                participantId: seat,
                pin: "5731",
                confirm: "Alex",
                identityConfirmed: true,
              },
              undefined,
              true,
            )
          ).status,
          400,
        );
        const request = await pending(recovered);
        assert.equal(
          (
            await call(
              path + "/recover",
              "POST",
              { participantId: seat },
              recovered,
            )
          ).status,
          200,
        );
        assert.equal((await hostEvent()).recoveryRequests.length, 1);
        for (const view of [
          await call(path, "GET", undefined, recovered),
          await call(path + "?view=projector", "GET", undefined, original),
          await call(path),
        ]) {
          assert.equal(view.body.me, undefined);
          assert.equal(view.body.recoveryRequests, undefined);
          for (const secret of [
            "PRIVATE_RECOVERY_NOTE",
            "legacy-pin-credential",
            "tokenHash",
            "recoveryLinks",
          ])
            assert.ok(!JSON.stringify(view.body).includes(secret));
        }
        const hostPayload = JSON.stringify(await hostEvent());
        assert.ok(!hostPayload.includes("tokenHash"));
        assert.ok(!hostPayload.includes("legacy-pin-credential"));
        assert.equal(
          (
            await call(
              path + "/recovery/" + request.id,
              "POST",
              { decision: "approve" },
              recovered,
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await call(
              path + "/recovery-link",
              "POST",
              { participantId: seat },
              recovered,
            )
          ).status,
          401,
        );
        assert.equal(
          (await call(path + "/recovery", "GET", undefined, randomUUID())).body
            .status,
          "none",
        );
        assert.equal((await decide(request.id, "deny")).status, 200);
        assert.equal(
          (await call(path + "/recovery", "GET", undefined, recovered)).body
            .status,
          "denied",
        );
        assert.equal(
          (await call(path, "GET", undefined, recovered)).body.me,
          undefined,
        );
        assert.equal((await decide(request.id, "approve")).status, 409);
        assert.deepEqual((await store.get(e.id))!.participants[0], before);
      },
    );
    await t.test(
      "approval restores only the requesting browser and preserves saved data and other sessions",
      async () => {
        const request = await pending(recovered);
        assert.equal((await decide(request.id, "approve")).status, 200);
        assert.equal(
          (await call(path + "/recovery", "GET", undefined, recovered)).body
            .status,
          "approved",
        );
        for (const token of [original, recovered]) {
          const me = (await call(path, "GET", undefined, token)).body.me;
          assert.equal(me.id, seat);
          assert.deepEqual(me.entries, before.entries);
          assert.deepEqual(me.avatar, before.avatar);
        }
        assert.equal(
          (await call(path, "GET", undefined, randomUUID())).body.me,
          undefined,
        );
        assert.equal(
          (
            await call(
              path + "/recover",
              "POST",
              { participantId: seat },
              other,
            )
          ).status,
          409,
        );
        assert.equal(
          (await call(path, "GET", undefined, recovered)).body.participants,
          2,
        );
        assert.deepEqual((await store.get(e.id))!.seating!.seats, [seat, null]);
      },
    );
    await t.test(
      "request expiry survives restart; expired approval never grants access",
      async () => {
        const token = randomUUID(),
          request = await pending(token);
        await store.mutate(e.id, (current) => {
          current.recoveryRequests!.find(
            (r) => r.id === request.id,
          )!.expiresAt = Date.now() - 1;
        });
        assert.equal((await decide(request.id, "approve")).status, 410);
        const persisted = await store.get(e.id);
        await new Promise<void>((r) => server.close(() => r()));
        await store.close();
        store = makeStore();
        server = createApp(store).listen(0, "127.0.0.1");
        await new Promise<void>((r) => server.once("listening", r));
        origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
        assert.deepEqual(await store.get(e.id), persisted);
        assert.equal(
          (await call(path + "/recovery", "GET", undefined, token)).body.status,
          "expired",
        );
        assert.equal(
          (await call(path, "GET", undefined, recovered)).body.me.id,
          seat,
        );
      },
    );
    await t.test(
      "links are hashed, one-use, expire, replace old links and bind to the exact participant/event",
      async () => {
        const old = await newLink(),
          secret = await newLink(),
          token = randomUUID();
        assert.ok(!JSON.stringify(await store.get(e.id)).includes(secret));
        assert.equal(
          (
            await call(
              path + "/recovery-link/redeem",
              "POST",
              { secret: old },
              token,
            )
          ).status,
          410,
        );
        assert.equal(
          (
            await call(
              path + "/recovery-link/redeem",
              "POST",
              { secret },
              other,
            )
          ).status,
          409,
        );
        const revision = (await store.get(e.id))!.revision;
        await call(path);
        await call(path + "/recovery", "GET", undefined, token);
        assert.equal((await store.get(e.id))!.revision, revision);
        const results = await Promise.all([
          call(path + "/recovery-link/redeem", "POST", { secret }, token),
          call(
            path + "/recovery-link/redeem",
            "POST",
            { secret },
            randomUUID(),
          ),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 410]);
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
        const expires = await newLink();
        await store.mutate(e.id, (current) => {
          current.recoveryLinks![0].expiresAt = Date.now() - 1;
        });
        assert.equal(
          (
            await call(
              path + "/recovery-link/redeem",
              "POST",
              { secret: expires },
              randomUUID(),
            )
          ).status,
          410,
        );
        const another = (
          await call(
            "/host/events",
            "POST",
            { name: "Separate event" },
            undefined,
            true,
          )
        ).body;
        assert.equal(
          (
            await call(
              `/events/${another.id}/recovery-link/redeem`,
              "POST",
              { secret: await newLink() },
              randomUUID(),
            )
          ).status,
          410,
        );
        assert.equal(
          (await call(path, "GET", undefined, original)).body.me.id,
          seat,
        );
        assert.equal(
          (await call(path, "GET", undefined, recovered)).body.me.id,
          seat,
        );
      },
    );
    for (let r = 2; r <= 8; r++) {
      await control("unlock");
      assert.equal(
        (
          await call(
            path + `/entries/${r}`,
            "PUT",
            { guess: choices[r - 1], rating: 8.2, notes: "", revision: 0 },
            original,
          )
        ).status,
        200,
      );
    }
    assert.equal(
      (await call(path + "/submit", "POST", {}, original)).status,
      200,
    );
    await control("lock", { override: true });
    await t.test(
      "both methods restore locked scorecards without enabling edits or changing submission",
      async () => {
        const token = randomUUID(),
          request = await pending(token);
        assert.equal((await decide(request.id, "approve")).status, 200);
        const second = randomUUID();
        assert.equal(
          (
            await call(
              path + "/recovery-link/redeem",
              "POST",
              { secret: await newLink() },
              second,
            )
          ).status,
          200,
        );
        for (const browser of [original, recovered, token, second]) {
          const state = (await call(path, "GET", undefined, browser)).body;
          assert.equal(state.me.id, seat);
          assert.equal(state.me.submitted, true);
          assert.equal(state.me.entries[1].notes, "PRIVATE_RECOVERY_NOTE");
          assert.equal(
            (
              await call(
                path + "/entries/1",
                "PUT",
                { guess: choices[0], rating: 9, notes: "", revision: 1 },
                browser,
              )
            ).status,
            423,
          );
          assert.equal(
            (await call(path + "/avatar", "PUT", { avatar: [] }, browser))
              .status,
            423,
          );
        }
      },
    );
    await t.test(
      "removal revokes every session and outstanding recovery credential",
      async () => {
        const token = randomUUID(),
          request = await pending(token),
          secret = await newLink();
        await control("remove", { participantId: seat, confirm: "Alex" });
        assert.equal((await decide(request.id, "approve")).status, 410);
        assert.equal(
          (
            await call(
              path + "/recovery-link/redeem",
              "POST",
              { secret },
              token,
            )
          ).status,
          410,
        );
        for (const browser of [original, recovered, token])
          assert.equal(
            (await call(path, "GET", undefined, browser)).body.me,
            undefined,
          );
        assert.deepEqual((await store.get(e.id))!.seating!.seats, [null, null]);
        assert.equal((await store.get(e.id))!.recoveryRequests!.length, 0);
        assert.equal((await store.get(e.id))!.recoveryLinks!.length, 0);
      },
    );
    await t.test("repeated abusive requests are rate limited", async () => {
      const token = randomUUID();
      for (let i = 0; i < 30; i++)
        await call(
          path + "/recover",
          "POST",
          { participantId: "missing" },
          token,
        );
      assert.equal(
        (
          await call(
            path + "/recover",
            "POST",
            { participantId: "missing" },
            token,
          )
        ).status,
        429,
      );
    });
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
