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
import { choices, initials } from "../src/shared.ts";

test("initials fallback handles single, multiple, accented and empty names", () => {
  assert.equal(initials(" Alex "), "A");
  assert.equal(initials("Alex Maria Chen"), "AC");
  assert.equal(initials("Élodie Durand"), "ÉD");
  assert.equal(initials(""), "?");
});

test("phase-one security, optional avatars and assisted entry preserve existing data", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "phase-one-"));
  process.env.SQLITE_PATH = join(dir, "events.sqlite");
  process.env.HOST_PASSWORD = "phase-one-test";
  process.env.SESSION_SECRET =
    "phase-one-test-secret-more-than-thirty-two-characters";
  delete process.env.DATABASE_URL;
  delete process.env.NODE_ENV;
  delete process.env.VERCEL;
  let store = makeStore();
  let server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  let origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let cookie = "";
  const guestToken = randomUUID(),
    recoveryToken = randomUUID();
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    host = false,
    token?: string,
    requestOrigin?: string,
  ) {
    const response = await fetch(origin + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(host ? { Cookie: cookie } : {}),
        ...(token ? { "X-Guest-Token": token } : {}),
        ...(requestOrigin ? { Origin: requestOrigin } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie"),
      cache: response.headers.get("cache-control"),
    };
  }
  try {
    cookie = (
      await call("/host/login", "POST", { password: process.env.HOST_PASSWORD })
    ).cookie!.split(";")[0];
    const legacy = (
      await call(
        "/host/events",
        "POST",
        { name: "Demo · preserve legacy event" },
        true,
      )
    ).body;
    const unchanged = await store.get(legacy.id);
    const event = (
      await call(
        "/host/events",
        "POST",
        { name: "Demo · spoiler security" },
        true,
      )
    ).body;
    const path = `/events/${event.id}`;
    let guestId = "";
    const submission = (view: any) => ({
      generation: 0,
      entryRevisions: Array.from(
        { length: 8 },
        (_, i) =>
          view.guests.find((g: any) => g.id === guestId).entries[i + 1]
            ?.revision ?? 0,
      ),
    });
    await t.test(
      "new guests may omit avatars; drawing, emoji and photo seats remain compatible",
      async () => {
        const joined = await call(
          path + "/join",
          "POST",
          { name: "Alex Chen" },
          false,
          guestToken,
        );
        assert.equal(joined.status, 200);
        guestId = joined.body.me.id;
        assert.equal(joined.body.me.avatar.length, 0);
        assert.equal(joined.body.me.emoji, "");
        assert.equal(
          (
            await call(
              path + "/join",
              "POST",
              { name: "Other" },
              false,
              guestToken,
            )
          ).body.me.id,
          guestId,
        );
        const drawing = [{ color: "#d6ad69", points: [[10, 10]] }];
        const drawn = await call(
          path + "/join",
          "POST",
          { name: "Drawn", avatar: drawing },
          false,
          randomUUID(),
        );
        assert.equal(drawn.status, 200);
        assert.deepEqual(drawn.body.me.avatar, drawing);
        const oldEmoji = await call(
          path + "/join",
          "POST",
          { name: "Legacy Emoji", emoji: "🍷", avatar: [] },
          false,
          randomUUID(),
        );
        assert.equal(oldEmoji.status, 200);
        assert.equal(oldEmoji.body.me.emoji, "🍷");
        const jpeg = await sharp({
          create: {
            width: 128,
            height: 128,
            channels: 3,
            background: "#8cc7df",
          },
        })
          .jpeg()
          .toBuffer();
        const photo = await call(
          path + "/join",
          "POST",
          {
            name: "Photo",
            avatarPhoto: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
          },
          false,
          randomUUID(),
        );
        assert.equal(photo.status, 200);
        assert.ok(photo.body.me.avatarPhoto);
        assert.equal(
          (
            await call(
              path + "/join",
              "POST",
              { name: "Unsafe", avatar: [{ color: "bad", points: [[1, 1]] }] },
              false,
              randomUUID(),
            )
          ).status,
          400,
        );
      },
    );
    const key = [...choices].reverse();
    const photo = await sharp({
      create: { width: 120, height: 360, channels: 3, background: "#492812" },
    })
      .jpeg()
      .toBuffer();
    const bottle = `data:image/jpeg;base64,${photo.toString("base64")}`;
    await store.mutate(event.id, (e) => {
      e.key = key;
      e.wines = choices.map((type, i) => ({
        type,
        producer: `PRIVATE_PRODUCER_${i}`,
      }));
      e.bottlePhotos = Object.fromEntries(
        choices.map((type) => [type, bottle]),
      );
      e.keyCorrections = [
        {
          at: "private",
          generation: 0,
          before: key,
          after: key,
          reason: "PRIVATE_REASON",
        },
      ];
      const participant = e.participants.find((p) => p.id === guestId)!;
      Object.assign(participant, {
        answerKey: key,
        producer: "PRIVATE_METADATA",
        purchaseUrl: "https://private.example/bottle",
      });
    });
    function noSpoilers(body: any, revealed = 0) {
      for (const field of [
        "key",
        "wines",
        "bottlePhotos",
        "roster",
        "keyCorrections",
        "leaderboard",
        "rankings",
        "purchaseUrl",
      ])
        assert.equal(body[field], undefined, field);
      if (revealed < 8) assert.equal(body.summary, undefined);
      assert.ok(!JSON.stringify(body).includes("PRIVATE_REASON"));
      assert.ok(!JSON.stringify(body.me || {}).includes("PRIVATE_METADATA"));
      assert.ok(!JSON.stringify(body).includes("private.example"));
      for (const result of body.results || [])
        if (result.round > revealed) {
          for (const field of [
            "wine",
            "producer",
            "bottlePhoto",
            "purchaseUrl",
            "correctness",
            "average",
            "count",
          ])
            assert.equal(result[field], undefined, field);
          for (const guess of result.guesses)
            for (const field of ["correct", "rating", "ratingIncluded"])
              assert.equal(guess[field], undefined, field);
        }
    }
    async function readVariants(revealed = 0) {
      for (const query of [
        "",
        "?view=projector",
        "?round=8&reveal=true",
        "?host=true",
        "?include=key,wines,summary",
      ]) {
        for (const token of [undefined, guestToken]) {
          const response = await call(
            path + query,
            "GET",
            undefined,
            false,
            token,
          );
          assert.equal(response.status, 200);
          assert.match(response.cache!, /no-store/);
          noSpoilers(response.body, revealed);
        }
      }
      assert.equal((await call(path + "?host=1")).status, 401);
      assert.equal((await call(path + "/export")).status, 401);
      const privateView = (await call(path + "?host=1", "GET", undefined, true))
        .body;
      assert.deepEqual(privateView.key, key);
      assert.equal(privateView.wines[0].producer, "PRIVATE_PRODUCER_0");
    }
    await t.test(
      "public queries cannot elevate access or return setup secrets",
      async () => {
        await readVariants();
      },
    );
    await store.mutate(event.id, (e) => {
      e.phase = "tasting";
      e.unlocked = 1;
    });
    await t.test(
      "assisted saves use guest validation, preserve notes, reject conflicts and never expose host secrets",
      async () => {
        assert.equal((await call(path + "/assisted")).status, 401);
        let view = (await call(path + "/assisted", "GET", undefined, true))
          .body;
        assert.deepEqual(
          Object.keys(view).sort(),
          [
            "id",
            "name",
            "phase",
            "unlocked",
            "revision",
            "generation",
            "choices",
            "guests",
          ].sort(),
        );
        noSpoilers(view);
        const endpoint = path + `/assisted/${guestId}/entries/1`;
        assert.equal(
          (
            await call(endpoint, "PUT", {
              guess: choices[0],
              rating: 8,
              revision: 0,
              generation: 0,
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await call(
              endpoint,
              "PUT",
              { guess: choices[0], rating: 8, revision: 0, generation: 0 },
              true,
              undefined,
              "https://evil.example",
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await call(
              path + `/assisted/${guestId}/entries/2`,
              "PUT",
              { guess: choices[1], rating: 8, revision: 0, generation: 0 },
              true,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await call(
              endpoint,
              "PUT",
              { guess: choices[0], rating: 8.01, revision: 0, generation: 0 },
              true,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await call(
              endpoint,
              "PUT",
              { guess: "UNKNOWN", rating: 8, revision: 0, generation: 0 },
              true,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await call(
              endpoint,
              "PUT",
              { guess: choices[0], rating: 8, revision: 0, generation: 99 },
              true,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await call(
              path + "/entries/1",
              "PUT",
              {
                guess: choices[0],
                rating: 7.3,
                notes: "PRIVATE_GUEST_NOTE",
                revision: 0,
              },
              false,
              guestToken,
            )
          ).status,
          200,
        );
        const save = await call(
          endpoint,
          "PUT",
          {
            guess: choices[1],
            rating: 8.2,
            revision: 1,
            generation: 0,
            notes: "overwrite attempted",
            correct: true,
            producer: "bad",
          },
          true,
        );
        assert.equal(save.status, 200);
        noSpoilers(save.body);
        assert.ok(!JSON.stringify(save.body).includes("PRIVATE_GUEST_NOTE"));
        assert.deepEqual(
          Object.keys(
            save.body.guests.find((g: any) => g.id === guestId).entries[1],
          ).sort(),
          ["guess", "rating", "revision", "enteredBy"].sort(),
        );
        const mine = (await call(path, "GET", undefined, false, guestToken))
          .body.me;
        assert.equal(mine.entries[1].notes, "PRIVATE_GUEST_NOTE");
        assert.equal(mine.entries[1].enteredBy, "host");
        assert.equal(mine.answerKey, undefined);
        assert.equal(
          (
            await call(
              endpoint,
              "PUT",
              { guess: choices[2], rating: 8, revision: 1, generation: 0 },
              true,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await call(
              path + `/assisted/unknown/entries/1`,
              "PUT",
              { guess: choices[1], rating: 8, revision: 0, generation: 0 },
              true,
            )
          ).status,
          404,
        );
        view = (await call(path + "/assisted", "GET", undefined, true)).body;
        assert.equal(
          (
            await call(
              path + `/assisted/${guestId}/submit`,
              "POST",
              submission(view),
              true,
            )
          ).status,
          423,
        );
        await readVariants();
      },
    );
    await store.mutate(event.id, (e) => {
      e.unlocked = 8;
    });
    await t.test(
      "full assisted card can be reviewed/submitted; guest edits clear source and invalid submissions",
      async () => {
        for (let round = 1; round <= 8; round++) {
          const e = (await store.get(event.id))!;
          const revision =
            e.participants.find((p) => p.id === guestId)!.entries[round]
              ?.revision ?? 0;
          assert.equal(
            (
              await call(
                path + `/assisted/${guestId}/entries/${round}`,
                "PUT",
                {
                  guess: key[round - 1],
                  rating: 7 + round / 10,
                  revision,
                  generation: 0,
                },
                true,
              )
            ).status,
            200,
          );
        }
        let view = (await call(path + "/assisted", "GET", undefined, true))
          .body;
        assert.equal(
          (
            await call(
              path + `/assisted/${guestId}/submit`,
              "POST",
              { ...submission(view), entryRevisions: Array(8).fill(-1) },
              true,
            )
          ).status,
          409,
        );
        // Another participant’s update must not invalidate this reviewed card.
        await store.mutate(event.id, (e) => {
          e.participants.find((p) => p.id !== guestId)!.submitted = false;
        });
        assert.equal(
          (
            await call(
              path + `/assisted/${guestId}/submit`,
              "POST",
              submission(view),
              true,
            )
          ).status,
          200,
        );
        let mine = (await call(path, "GET", undefined, false, guestToken)).body
          .me;
        assert.equal(mine.submitted, true);
        const edit = await call(
          path + "/entries/1",
          "PUT",
          {
            guess: key[1],
            rating: 7.1,
            notes: "PRIVATE_GUEST_NOTE",
            revision: mine.entries[1].revision,
          },
          false,
          guestToken,
        );
        assert.equal(edit.status, 200);
        assert.equal(edit.body.me.submitted, false);
        assert.equal(edit.body.me.entries[1].enteredBy, undefined);
        view = (await call(path + "/assisted", "GET", undefined, true)).body;
        assert.equal(
          (
            await call(
              path + `/assisted/${guestId}/submit`,
              "POST",
              submission(view),
              true,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await call(
              path + `/assisted/${guestId}/entries/1`,
              "PUT",
              {
                guess: key[0],
                rating: 7.1,
                revision: edit.body.me.entries[1].revision,
                generation: 0,
              },
              true,
            )
          ).status,
          200,
        );
        view = (await call(path + "/assisted", "GET", undefined, true)).body;
        assert.equal(
          (
            await call(
              path + `/assisted/${guestId}/submit`,
              "POST",
              submission(view),
              true,
            )
          ).status,
          200,
        );
      },
    );
    await store.mutate(event.id, (e) => {
      e.phase = "locked";
      e.presenting = 1;
    });
    await t.test(
      "lock, countdown, every progressive reveal and final summary enforce secrecy",
      async () => {
        await readVariants();
        assert.equal(
          (
            await call(
              path + `/assisted/${guestId}/entries/1`,
              "PUT",
              { guess: key[0], rating: 8, revision: 5, generation: 0 },
              true,
            )
          ).status,
          423,
        );
        const view = (await call(path + "/assisted", "GET", undefined, true))
          .body;
        assert.equal(
          (
            await call(
              path + `/assisted/${guestId}/submit`,
              "POST",
              submission(view),
              true,
            )
          ).status,
          423,
        );
        await store.mutate(event.id, (e) => {
          e.revealed = 1;
          e.revealCountdown = { round: 1, endsAt: Date.now() + 10000 };
        });
        await readVariants();
        for (let round = 1; round <= 8; round++) {
          await store.mutate(event.id, (e) => {
            delete e.revealCountdown;
            e.revealed = round;
            e.presenting = Math.min(8, round + 1);
          });
          await readVariants(round);
          const pub = (await call(path, "GET", undefined, false, guestToken))
            .body;
          assert.equal(pub.results[round - 1].wine, key[round - 1]);
          assert.ok(pub.results[round - 1].bottlePhoto);
          assert.equal(
            pub.results[round - 1].guesses.find(
              (g: any) => g.name === "Alex Chen",
            ).correct,
            true,
          );
          const assisted = (
            await call(path + "/assisted", "GET", undefined, true)
          ).body;
          assert.equal(assisted.results, undefined);
          assert.ok(!JSON.stringify(assisted).includes("PRIVATE_PRODUCER"));
          assert.ok(!JSON.stringify(assisted).includes(bottle));
        }
        await store.mutate(event.id, (e) => {
          e.phase = "summary";
        });
        const final = (await call(path, "GET", undefined, false, guestToken))
          .body;
        assert.equal(
          final.summary.leaderboard.find((g: any) => g.name === "Alex Chen")
            .score,
          8,
        );
        assert.equal(final.summary.wines[0].count, 1);
        const corrupt = (await store.get(event.id))!;
        corrupt.revealed = 1;
        assert.equal(publicEvent(corrupt).summary, undefined);
      },
    );
    await t.test(
      "refresh, host-approved recovery, SQLite restart and unrelated legacy event preservation",
      async () => {
        await call(
          path + "/recover",
          "POST",
          { participantId: guestId },
          false,
          recoveryToken,
        );
        const request = (await call(path + "?host=1", "GET", undefined, true))
          .body.recoveryRequests[0];
        assert.equal(
          (
            await call(
              path + `/recovery/${request.id}`,
              "POST",
              { decision: "approve" },
              true,
            )
          ).status,
          200,
        );
        const recovered = await call(
          path,
          "GET",
          undefined,
          false,
          recoveryToken,
        );
        assert.equal(recovered.status, 200);
        assert.equal(recovered.body.me.id, guestId);
        assert.equal(recovered.body.me.entries[1].notes, "PRIVATE_GUEST_NOTE");
        const before = await store.get(event.id);
        await new Promise<void>((r) => server.close(() => r()));
        await store.close();
        store = makeStore();
        server = createApp(store).listen(0, "127.0.0.1");
        await new Promise<void>((r) => server.once("listening", r));
        origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
        assert.deepEqual(await store.get(event.id), before);
        assert.deepEqual(await store.get(legacy.id), unchanged);
        assert.equal(
          (await call(path, "GET", undefined, false, recoveryToken)).body.me.id,
          guestId,
        );
      },
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
