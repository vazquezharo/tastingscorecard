import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
import { makeStore } from "../server/store.ts";
import { publicEvent, assistedEvent } from "../server/results.ts";

test("host-supplied retailer links appear only after the full tasting and match the configured producer", () => {
  const e = fixture();
  assert.equal(JSON.stringify(publicEvent(e)).includes("totalwine.com"), false);
  e.phase = "locked";
  e.unlocked = 8;
  e.revealed = 8;
  assert.equal(JSON.stringify(publicEvent(e)).includes("totalwine.com"), false);
  e.phase = "summary";
  const results = publicEvent(e).results;
  assert.equal(
    results.filter((w) =>
      w.purchaseUrl?.startsWith("https://www.totalwine.com/"),
    ).length,
    8,
  );
  assert.equal(new Set(results.map((w) => w.purchaseUrl)).size, 8);
  e.key.reverse();
  assert.equal(publicEvent(e).results[0].purchaseUrl, results[7].purchaseUrl);
  e.wines = choices.map((type) => ({ type, producer: "Different bottle" }));
  assert.equal(
    publicEvent(e).results.some((w) => w.purchaseUrl),
    false,
  );
});
import { tonight, tonightBottle } from "../server/tonight-bottles.ts";
import { choices, type Event } from "../src/shared.ts";
import { eveningStats, wineRanks } from "../src/reveal-stats.ts";
function fixture(): Event {
  return {
    id: "f".repeat(32),
    name: "Fictional signature rehearsal",
    key: [...choices],
    phase: "setup",
    unlocked: 0,
    revealed: 0,
    presenting: 0,
    revision: 0,
    controlRevision: 0,
    generation: 0,
    createdAt: new Date().toISOString(),
    participants: [0, 1, 2].map((i) => ({
      id: String(i),
      name: `Guest ${i}`,
      emoji: "",
      submitted: i < 2,
      tokenHash: `hash-${i}`,
      entries: Object.fromEntries(
        choices.map((guess, r) => [
          r + 1,
          {
            guess: choices[(r + (i === 1 ? 2 : 0)) % 8],
            rating: r === 0 ? 10 : i === 0 ? 8 : 6,
            notes: "PRIVATE_NOTES",
            revision: 1,
          },
        ]),
      ),
    })),
  };
}
test("tonight bottle configuration is event/order specific and rejects unsafe direct links", () => {
  const e = fixture();
  const config = {
    eventId: e.id,
    bottles: choices.map((type) => ({
      type,
      producer: "EXACT_BOTTLE",
      image: "https://images.example/bottle.jpg",
      purchaseUrl: "https://shop.example/exact-bottle",
    })),
  };
  assert.equal(
    tonightBottle(e, 1, config)?.purchaseUrl,
    "https://shop.example/exact-bottle",
  );
  assert.equal(tonightBottle({ ...e, id: "another" }, 1, config), undefined);
  assert.equal(
    tonightBottle({ ...e, key: [...e.key].reverse() }, 1, config),
    undefined,
  );
  assert.equal(tonightBottle(e, 0, config), undefined);
  config.bottles[0].purchaseUrl = "javascript:alert(1)";
  config.bottles[0].image = "https://user:password@example.com/image";
  assert.equal(tonightBottle(e, 1, config)?.purchaseUrl, undefined);
  assert.equal(tonightBottle(e, 1, config)?.image, undefined);
});
test("staged reveal persists and enforces secrecy through all eight rounds and explicit summary", async () => {
  const dir = mkdtempSync(join(tmpdir(), "signature-"));
  process.env.SQLITE_PATH = join(dir, "test.sqlite");
  process.env.HOST_PASSWORD = "signature-test";
  process.env.SESSION_SECRET =
    "signature-test-secret-with-more-than-32-characters";
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL;
  delete process.env.NODE_ENV;
  const store = makeStore();
  const e = fixture();
  await store.create(e);
  const original = structuredClone(tonight);
  tonight.eventId = e.id;
  tonight.bottles = choices.map((type, i) => ({
    type,
    producer: `SECRET_BOTTLE_${i + 1}`,
    ...(i === 0
      ? {
          image: "https://images.example/secret.jpg",
          purchaseUrl: "https://shop.example/exact-bottle",
        }
      : {}),
  }));
  const legacy = { ...fixture(), id: "a".repeat(32) };
  await store.create(legacy);
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let cookie = "";
  const call = async (path: string, data?: unknown, host = true) => {
    const res = await fetch(origin + "/api" + path, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(host ? { Cookie: cookie } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return {
      status: res.status,
      body: await res.json(),
      cookie: res.headers.get("set-cookie"),
    };
  };
  try {
    cookie = (
      await call("/host/login", { password: process.env.HOST_PASSWORD })
    ).cookie!.split(";")[0];
    const path = `/events/${e.id}`;
    const control = async (action: string, extra = {}) => {
      const state = (await call(path + "?host=1")).body;
      return call(path + "/control", {
        action,
        revision: state.controlRevision,
        ...extra,
      });
    };
    for (const phase of ["setup", "tasting"] as const) {
      e.phase = phase;
      const pub = publicEvent(e, "hash-0");
      assert.equal(pub.parade, undefined);
      assert.ok(!JSON.stringify(pub).includes("SECRET_BOTTLE"));
    }
    await store.mutate(e.id, (s) => {
      s.phase = "tasting";
      s.unlocked = 8;
    });
    assert.equal((await control("lock", { override: true })).status, 200);
    const before = (await call(path, undefined, false)).body;
    assert.equal(before.parade.guesses.length, 3);
    assert.deepEqual(
      Object.keys(before.parade.guesses[0]).sort(),
      ["name", "emoji", "guess", "rating"].sort(),
    );
    assert.equal(before.parade.guesses[0].rating, 10);
    assert.equal(before.summary, undefined);
    assert.equal(
      (
        await call(
          path + "/control",
          { action: "reveal", revision: 1, staged: true },
          false,
        )
      ).status,
      401,
    );
    assert.equal((await control("reveal", { staged: "yes" })).status, 400);
    for (let round = 1; round <= 8; round++) {
      if (round > 1) assert.equal((await control("next")).status, 200);
      assert.equal(
        (await control("reveal", { staged: true, countdown: round === 1 }))
          .status,
        200,
      );
      const pending = (await call(path, undefined, false)).body;
      assert.equal(pending.revealed, round - 1);
      assert.ok(
        pending.revealCountdown.endsAt >= pending.revealStage.paradeEndsAt,
      );
      if (round === 1)
        assert.equal(
          pending.revealCountdown.endsAt - pending.revealCountdown.startsAt,
          3000,
        );
      const wine = pending.results.find((w: any) => w.round === round);
      for (const key of [
        "wine",
        "producer",
        "bottlePhoto",
        "purchaseUrl",
        "average",
        "count",
      ])
        assert.equal(wine[key], undefined);
      assert.ok(wine.guesses.every((g: any) => g.correct === undefined));
      assert.equal(pending.summary, undefined);
      assert.equal((await control("next")).status, 409);
      assert.equal((await control("summary")).status, 409);
      const snapshot = await store.get(e.id);
      const reopened = makeStore();
      assert.deepEqual(
        (await reopened.get(e.id))?.revealCountdown,
        snapshot?.revealCountdown,
      );
      await reopened.close();
      await store.mutate(e.id, (s) => {
        s.revealCountdown!.endsAt = Date.now() - 1;
      });
      const after = (await call(path, undefined, false)).body;
      assert.equal(after.revealed, round);
      assert.equal(after.results[round - 1].producer, `SECRET_BOTTLE_${round}`);
      assert.equal(after.results[round - 1].guesses[0].correct, true);
      assert.equal(after.results[round - 1].count, 2);
      assert.equal(
        after.results[round - 1].purchaseUrl,
        round === 1 ? "https://shop.example/exact-bottle" : undefined,
      );
      assert.equal(
        after.results[round - 1].bottlePhoto,
        round === 1 ? "https://images.example/secret.jpg" : undefined,
      );
      assert.equal(after.summary, undefined);
      assert.ok(
        !JSON.stringify(assistedEvent((await store.get(e.id))!)).includes(
          "SECRET_BOTTLE",
        ),
      );
      assert.ok(!JSON.stringify(after.parade || {}).includes("PRIVATE_NOTES"));
    }
    assert.equal((await control("summary")).status, 200);
    const final = (await call(path, undefined, false)).body;
    assert.equal(final.summary.wines.length, 8);
    assert.deepEqual(
      final.summary.leaderboard.map((g: any) => g.rank),
      [1, 1, 3],
    );
    assert.equal(final.summary.wines[0].average, 10);
    assert.deepEqual(await store.get(legacy.id), legacy);
  } finally {
    Object.assign(tonight, original);
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("wine ranks retain precision and ties; stats omit unreliable or absent ratings", () => {
  const e = fixture();
  e.phase = "summary";
  e.revealed = 8;
  e.presenting = 8;
  e.unlocked = 8;
  const wines = publicEvent(e).summary!.wines;
  assert.deepEqual(
    wineRanks(wines).map((w) => w.rank),
    [1, 2, 2, 2, 2, 2, 2, 2],
  );
  assert.deepEqual(
    wineRanks([
      { ...wines[0], average: 8.04 },
      { ...wines[1], average: 8.03 },
      { ...wines[2], average: 8.04 },
      { ...wines[3], average: null },
    ]).map((w) => w.rank),
    [1, 1, 3, null],
  );
  assert.match(
    eveningStats(wines).find((s) => s.label === "Highest individual rating")!
      .text,
    /10.0.*Wine 1/,
  );
  assert.deepEqual(eveningStats([]), []);
  assert.ok(
    !eveningStats(
      wines.map((w) => ({
        ...w,
        guesses: w.guesses.map((g) => ({ ...g, ratingIncluded: false })),
      })),
    ).some((s) => /rating/i.test(s.label)),
  );
});
