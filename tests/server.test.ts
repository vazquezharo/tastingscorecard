import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.ts";
import { makeStore } from "../server/store.ts";
import { choices, type PublicEvent } from "../src/shared.ts";

test("persistent multi-session tasting: access, validation, reveals, scoring, CSV and reset", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tasting-test-"));
  process.env.SQLITE_PATH = join(dir, "test.sqlite");
  process.env.HOST_PASSWORD = "Admin";
  process.env.SESSION_SECRET =
    "test-session-secret-with-at-least-32-characters";
  delete process.env.DATABASE_URL;
  delete process.env.NODE_ENV;
  let store = makeStore();
  let server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  let port = (server.address() as { port: number }).port;
  let cookie = "";
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    token?: string,
    host = false,
  ) {
    if (
      path.endsWith("/join") &&
      body &&
      typeof body === "object" &&
      !("avatar" in body)
    ) {
      body = {
        ...body,
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
    const r = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Guest-Token": token } : {}),
        ...(host ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    return {
      status: r.status,
      text,
      json: r.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(text)
        : null,
      cookie: r.headers.get("set-cookie"),
    };
  }
  try {
    await t.test("host permissions and configuration", async () => {
      assert.equal((await call("/host/events")).status, 401);
      assert.equal(
        (await call("/host/login", "POST", { password: "wrong" })).status,
        401,
      );
      const r = await call("/host/login", "POST", {
        password: "Admin",
      });
      assert.equal(r.status, 200);
      cookie = r.cookie!.split(";")[0];
      assert.match(r.cookie!, /HttpOnly/);
      assert.match(r.cookie!, /SameSite=Strict/);
    });
    const created = await call(
      "/host/events",
      "POST",
      { name: "Test evening" },
      undefined,
      true,
    );
    assert.equal(created.status, 201);
    const id = created.json.id;
    const path = `/events/${id}`;
    let state: PublicEvent = created.json;
    const control = async (
      action: string,
      extra: Record<string, unknown> = {},
    ) => {
      state = (await call(path + "?host=1", "GET", undefined, undefined, true))
        .json;
      const r = await call(
        path + "/control",
        "POST",
        { action, revision: state.controlRevision, ...extra },
        undefined,
        true,
      );
      if (r.status === 200) state = r.json;
      return r;
    };
    const key = [
      choices[5],
      choices[1],
      choices[7],
      choices[0],
      choices[4],
      choices[6],
      choices[3],
      choices[2],
    ];
    const tokens = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await t.test(
      "idempotent join and explicit duplicate-name handling",
      async () => {
        assert.equal(
          (
            await call(
              path + "/join",
              "POST",
              {
                name: "Invalid drawing",
                avatar: [
                  { color: "not-an-approved-color", points: [[10, 10]] },
                ],
              },
              randomUUID(),
            )
          ).status,
          400,
        );
        assert.equal((await call(path)).json.participants, 0);
        for (let i = 0; i < 4; i++)
          assert.equal(
            (
              await call(
                path + "/join",
                "POST",
                {
                  name: ["Ada", "Bea", "Duplicate", "Missing"][i],
                  emoji: "🍷",
                },
                tokens[i],
              )
            ).status,
            200,
          );
        assert.equal(
          (
            await call(
              path + "/join",
              "POST",
              { name: "Ada", emoji: "🍷" },
              tokens[0],
            )
          ).json.participants,
          4,
        );
        assert.equal(
          (
            await call(
              path + "/join",
              "POST",
              { name: "ada", emoji: "🍷" },
              randomUUID(),
            )
          ).status,
          409,
        );
        assert.equal((await call(path)).json.participants, 4);
        assert.equal(
          (await call(path, "GET", undefined, tokens[0])).json.me.name,
          "Ada",
        );
      },
    );
    await t.test(
      "key validation, secrecy and sequential unlocking",
      async () => {
        assert.equal((await control("start")).status, 400);
        assert.equal(
          (await control("key", { key: Array(8).fill(choices[0]) })).status,
          400,
        );
        assert.equal((await control("key", { key })).status, 200);
        const pub = await call(path);
        assert.equal(pub.json.key, undefined);
        assert.equal(pub.json.results.length, 0);
        assert.ok(!pub.text.includes("St. Francis"));
        assert.equal((await control("start")).json.unlocked, 1);
        assert.equal(
          (await control("key", { key: [...key].reverse() })).status,
          423,
        );
        assert.equal(
          (
            await call(path + "/control", "POST", {
              action: "unlock",
              revision: state.controlRevision,
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await call(
              path + "/entries/2",
              "PUT",
              { guess: choices[0], rating: 7, notes: "", revision: 0 },
              tokens[0],
            )
          ).status,
          403,
        );
        assert.equal((await control("lock")).status, 400);
        for (let i = 2; i <= 8; i++)
          assert.equal((await control("unlock")).json.unlocked, i);
      },
    );
    await t.test(
      "concurrent saves preserve data and reject conflicting revisions",
      async () => {
        const writes = await Promise.all(
          ["first", "second"].map((notes) =>
            call(
              path + "/entries/1",
              "PUT",
              { guess: key[0], rating: 7, notes, revision: 0 },
              tokens[0],
            ),
          ),
        );
        assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
        const independent = await Promise.all(
          [1, 2].map((i) =>
            call(
              path + "/entries/1",
              "PUT",
              { guess: key[0], rating: 7, notes: "independent", revision: 0 },
              tokens[i],
            ),
          ),
        );
        assert.deepEqual(
          independent.map((r) => r.status),
          [200, 200],
        );
        for (const i of [0, 1, 2])
          assert.equal(
            (await call(path, "GET", undefined, tokens[i])).json.me.entries[1]
              .revision,
            1,
          );
      },
    );
    const save = async (
      i: number,
      r: number,
      guess: string,
      rating: number | null,
      notes = "",
    ) => {
      const me = (await call(path, "GET", undefined, tokens[i])).json.me;
      return call(
        path + `/entries/${r}`,
        "PUT",
        { guess, rating, notes, revision: me.entries[r]?.revision || 0 },
        tokens[i],
      );
    };
    await t.test(
      "drafts, decimals, revisions, duplicates and final validation",
      async () => {
        assert.equal((await save(0, 1, "", null)).status, 200);
        assert.equal((await save(0, 1, key[0], 8.01)).status, 400);
        for (let r = 1; r <= 8; r++) {
          assert.equal(
            (
              await save(
                0,
                r,
                key[r - 1],
                [8, 8.1, 4, 4, 7, 7, 6, 6][r - 1],
                r === 1 ? '=formula, "quoted"\nnotes' : "",
              )
            ).status,
            200,
          );
          assert.equal(
            (await save(1, r, key[r - 1], [8.1, 8, 4, 4, 7, 7, 6, 6][r - 1]))
              .status,
            200,
          );
          assert.equal(
            (await save(2, r, r === 2 ? key[0] : key[r - 1], 9)).status,
            200,
          );
        }
        assert.equal((await save(3, 1, key[0], 10)).status, 200);
        const hostSheet = (
          await call(path + "?host=1", "GET", undefined, undefined, true)
        ).json.roster;
        assert.equal(hostSheet[0].entries[1].rating, 8);
        assert.ok(hostSheet[0].entries[1].notes.includes("quoted"));
        assert.equal(hostSheet[0].correctCount, 8);
        for (const sheet of hostSheet)
          for (const key of ["tokenHash", "tokenAliases", "recoveryHash"])
            assert.equal(sheet[key], undefined);
        assert.equal(
          (await call(path + "?host=1", "GET", undefined, tokens[1])).status,
          401,
        );
        const otherGuest = (await call(path, "GET", undefined, tokens[1])).json;
        assert.equal(otherGuest.roster, undefined);
        assert.ok(!JSON.stringify(otherGuest).includes("quoted"));
        const display = (await call(path + "?view=projector")).json;
        assert.equal(display.roster, undefined);
        assert.ok(!JSON.stringify(display).includes("quoted"));

        assert.equal(
          (await call(path + "/submit", "POST", {}, tokens[2])).status,
          400,
        );
        assert.equal(
          (await call(path + "/submit", "POST", {}, tokens[3])).status,
          400,
        );
        assert.equal(
          (await call(path + "/submit", "POST", {}, tokens[0])).json.me
            .submitted,
          true,
        );
        assert.equal(
          (await call(path + "/submit", "POST", {}, tokens[1])).json.me
            .submitted,
          true,
        );
        assert.equal(
          (
            await call(
              path + "/entries/1",
              "PUT",
              { guess: key[0], rating: 8, notes: "stale", revision: 0 },
              tokens[0],
            )
          ).status,
          409,
        );
        assert.equal((await save(0, 2, key[0], 8.1)).json.me.submitted, false);
        assert.equal((await save(0, 2, key[1], 8.1)).json.me.submitted, false);
        assert.equal(
          (await call(path + "/submit", "POST", {}, tokens[0])).json.me
            .submitted,
          true,
        );
        const other = (await call(path, "GET", undefined, tokens[1])).text;
        assert.ok(!other.includes("formula"));
        const projector = (
          await call(path + "?view=projector", "GET", undefined, tokens[0])
        ).json;
        assert.equal(projector.me, undefined);
        assert.equal(projector.results.length, 0);
      },
    );
    await t.test(
      "lock warning names affected guests, explicit override and server lock",
      async () => {
        const warning = await control("lock");
        assert.equal(warning.status, 409);
        assert.match(warning.json.error, /Duplicate, Missing/);
        assert.equal((await control("lock", { override: true })).status, 200);
        assert.equal((await save(0, 1, key[0], 9)).status, 423);
        assert.equal(
          (await call(path + "/submit", "POST", {}, tokens[0])).status,
          423,
        );
        assert.equal(
          (
            await call(
              path + "/join",
              "POST",
              { name: "Late", emoji: "🍷" },
              randomUUID(),
            )
          ).status,
          423,
        );
      },
    );
    await t.test(
      "one-at-a-time reveals, projector privacy and correct averages",
      async () => {
        let pub = (await call(path)).json;
        assert.equal(pub.results.length, 1);
        assert.equal(pub.results[0].wine, undefined);
        assert.equal(pub.results[0].average, undefined);
        assert.equal(pub.results[0].guesses[0].rating, undefined);
        assert.equal(
          (
            await call(
              path + "/control",
              "POST",
              { action: "reveal", revision: state.controlRevision },
              tokens[0],
            )
          ).status,
          401,
        );
        assert.equal((await control("summary")).status, 400);
        assert.equal((await control("reveal")).status, 200);
        pub = (await call(path)).json;
        assert.equal(pub.results[0].wine, key[0]);
        assert.equal(pub.results[0].average, 8.05);
        assert.equal(pub.results[0].count, 2);
        assert.equal(pub.results[0].guesses[2].correct, false);
        assert.equal(pub.results[0].guesses[3].rating, 10);
        assert.equal(pub.results[0].guesses[3].ratingIncluded, false);
        assert.equal((await control("reveal")).status, 400);
        for (let r = 2; r <= 8; r++) {
          assert.equal((await control("next")).status, 200);
          pub = (await call(path)).json;
          assert.equal(pub.results.at(-1).wine, undefined);
          assert.equal((await control("reveal")).status, 200);
        }
        assert.equal((await control("summary")).status, 200);
        const s = state.summary!;
        assert.deepEqual(
          s.leaderboard.map((p) => [p.name, p.score, p.rank]),
          [
            ["Ada", 8, 1],
            ["Bea", 8, 1],
            ["Duplicate", 6, 3],
            ["Missing", 1, 4],
          ],
        );
        assert.deepEqual(s.most, ["Ada", "Bea"]);
        assert.deepEqual(s.fewest, ["Missing"]);
        assert.deepEqual(s.highest, [key[0], key[1]]);
        assert.deepEqual(s.lowest, [key[2], key[3]]);
        assert.ok(s.leaderboard[2].incomplete);
        assert.equal(s.wines[0].average, 8.05);
      },
    );
    await t.test(
      "CSV includes all rows and safe notes; persistent results after restart",
      async () => {
        assert.equal((await call(path + "/export")).status, 401);
        const exported = await call(
          path + "/export",
          "GET",
          undefined,
          undefined,
          true,
        );
        assert.equal(exported.status, 200);
        assert.match(exported.text, /wine_type/);
        assert.match(exported.text, /"'=formula, ""quoted""/);
        assert.ok(exported.text.includes("La Enfermera"));
        assert.equal(exported.text.split("\r\n").length, 33);
        await new Promise<void>((r) => server.close(() => r()));
        await store.close();
        store = makeStore();
        server = createApp(store).listen(0, "127.0.0.1");
        await new Promise<void>((r) => server.once("listening", r));
        port = (server.address() as { port: number }).port;
        const saved = (await call(path)).json;
        assert.equal(saved.phase, "summary");
        assert.equal(saved.summary.leaderboard[0].score, 8);
        assert.equal(
          (await call(path, "GET", undefined, tokens[0])).json.me.name,
          "Ada",
        );
      },
    );
    await t.test(
      "explicit reset clears key and entries but preserves browser identity",
      async () => {
        const second = await call(
          "/host/events",
          "POST",
          { name: "Reset trial" },
          undefined,
          true,
        );
        const p = `/events/${second.json.id}`;
        await call(
          p + "/join",
          "POST",
          { name: "Ada", emoji: "🍷" },
          tokens[0],
        );
        let e = (await call(p + "?host=1", "GET", undefined, undefined, true))
          .json;
        let r = await call(
          p + "/control",
          "POST",
          { action: "key", key, revision: e.controlRevision },
          undefined,
          true,
        );
        r = await call(
          p + "/control",
          "POST",
          { action: "start", revision: r.json.controlRevision },
          undefined,
          true,
        );
        await call(
          p + "/entries/1",
          "PUT",
          { guess: key[0], rating: 7, notes: "reset", revision: 0 },
          tokens[0],
        );
        e = (await call(p + "?host=1", "GET", undefined, undefined, true)).json;
        assert.equal(
          (
            await call(
              p + "/control",
              "POST",
              {
                action: "reset",
                confirm: "wrong",
                revision: e.controlRevision,
              },
              undefined,
              true,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await call(
              p + "/control",
              "POST",
              {
                action: "reset",
                confirm: "Reset trial",
                revision: e.controlRevision,
              },
              undefined,
              true,
            )
          ).status,
          200,
        );
        e = (await call(p, "GET", undefined, tokens[0])).json;
        assert.equal(e.phase, "setup");
        assert.deepEqual(e.me.entries, {});
        assert.equal(e.participants, 1);
        assert.equal(e.me.submitted, false);
        assert.equal(
          (await control("reset", { confirm: "Test evening" })).status,
          423,
        );
      },
    );
    await t.test(
      "custom event wines drive validation, private producers, scoring and CSV",
      async () => {
        let custom = (
          await call(
            "/host/events",
            "POST",
            { name: "Custom wines trial" },
            undefined,
            true,
          )
        ).json;
        const path = `/events/${custom.id}`;
        async function action(
          action: string,
          extra: Record<string, unknown> = {},
          authorized = true,
        ) {
          custom = (
            await call(path + "?host=1", "GET", undefined, undefined, true)
          ).json;
          return call(
            path + "/control",
            "POST",
            { action, revision: custom.controlRevision, ...extra },
            undefined,
            authorized,
          );
        }
        const wines = custom.wines.map(
          (w: { type: string; producer: string }, i: number) =>
            i === 0 ? { type: "Nebbiolo", producer: "Private Demo Estate" } : w,
        );
        assert.equal((await action("wines", { wines }, false)).status, 401);
        assert.equal(
          (await action("wines", { wines: wines.map(() => wines[0]) })).status,
          400,
        );
        assert.equal((await action("key", { key: [...choices] })).status, 200);
        assert.equal((await action("wines", { wines })).status, 200);
        custom = (
          await call(path + "?host=1", "GET", undefined, undefined, true)
        ).json;
        assert.deepEqual(custom.key, []);
        const allowed = wines.map((w: { type: string }) => w.type);
        assert.equal((await action("key", { key: allowed })).status, 200);
        const token = randomUUID();
        assert.equal(
          (await call(path + "/join", "POST", { name: "Custom guest" }, token))
            .status,
          200,
        );
        assert.equal((await action("start")).status, 200);
        assert.equal((await action("wines", { wines })).status, 423);
        let guest = (await call(path, "GET", undefined, token)).json;
        assert.ok(!JSON.stringify(guest).includes("Private Demo Estate"));
        assert.equal(guest.wines, undefined);
        assert.deepEqual(guest.choices, allowed);
        assert.equal(
          (
            await call(
              path + "/entries/1",
              "PUT",
              {
                guess: "Pinot Noir",
                rating: 9.2,
                notes: "custom note",
                revision: 0,
              },
              token,
            )
          ).status,
          400,
        );
        for (let round = 1; round <= 8; round++) {
          if (round > 1) assert.equal((await action("unlock")).status, 200);
          assert.equal(
            (
              await call(
                path + `/entries/${round}`,
                "PUT",
                {
                  guess: allowed[round - 1],
                  rating: round === 1 ? 9.2 : 7.5,
                  notes: "custom note",
                  revision: 0,
                },
                token,
              )
            ).status,
            200,
          );
        }
        assert.equal(
          (await call(path + "/submit", "POST", {}, token)).status,
          200,
        );
        assert.equal((await action("lock")).status, 200);
        assert.ok(
          !JSON.stringify((await call(path)).json).includes(
            "Private Demo Estate",
          ),
        );
        for (let round = 1; round <= 8; round++) {
          if (round > 1) assert.equal((await action("next")).status, 200);
          assert.equal((await action("reveal")).status, 200);
        }
        assert.equal((await action("summary")).status, 200);
        guest = (await call(path)).json;
        assert.equal(guest.summary.leaderboard[0].score, 8);
        assert.equal(guest.summary.wines[0].wine, "Nebbiolo");
        assert.equal(guest.summary.wines[0].producer, "Private Demo Estate");
        assert.equal(guest.summary.wines[0].average, 9.2);
        assert.equal(guest.summary.wines[0].count, 1);
        const csv = await call(
          path + "/export",
          "GET",
          undefined,
          undefined,
          true,
        );
        assert.ok(
          csv.text.includes("Nebbiolo") &&
            csv.text.includes("Private Demo Estate") &&
            csv.text.includes("custom note"),
        );
        assert.equal((await store.get(custom.id))?.wines?.[0].type, "Nebbiolo");
      },
    );
    await t.test(
      "host-only explicit deletion removes event data persistently",
      async () => {
        const events = (
          await call("/host/events", "GET", undefined, undefined, true)
        ).json;
        const ids = events.map((e: PublicEvent) => e.id);
        const body = {
          ids,
          password: "Admin",
          confirmation: "DELETE ALL TASTINGS",
        };
        assert.equal((await call("/host/events", "DELETE", body)).status, 401);
        assert.equal(
          (
            await call(
              "/host/events",
              "DELETE",
              { ...body, password: "wrong" },
              undefined,
              true,
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await call(
              "/host/events",
              "DELETE",
              { ...body, confirmation: "wrong" },
              undefined,
              true,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await call(
              "/host/events",
              "DELETE",
              { ...body, ids: ["invalid"] },
              undefined,
              true,
            )
          ).status,
          400,
        );
        assert.equal(
          (await call("/host/events", "GET", undefined, undefined, true)).json
            .length,
          ids.length,
        );
        const result = await call(
          "/host/events",
          "DELETE",
          body,
          undefined,
          true,
        );
        assert.equal(result.status, 200);
        assert.equal(result.json.deleted, ids.length);
        assert.deepEqual(
          (await call("/host/events", "GET", undefined, undefined, true)).json,
          [],
        );
        for (const id of ids)
          assert.equal((await call(`/events/${id}`)).status, 404);
        await store.close();
        store = makeStore();
        assert.deepEqual(await store.list(), []);
      },
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
