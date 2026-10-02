import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
import { makeStore } from "../server/store.ts";
import { publicEvent } from "../server/results.ts";
import { producers } from "../server/wines.ts";
import { libraryBottlePhoto } from "../server/bottle-library.ts";
import { choices, type Event } from "../src/shared.ts";

function fixture(): Event {
  return {
    id: "b".repeat(32),
    name: "Fictional · bottle verification",
    phase: "setup",
    key: [...choices],
    wines: choices.map((type) => ({ type, producer: producers[type] })),
    participants: [],
    unlocked: 0,
    revealed: 0,
    presenting: 0,
    revision: 0,
    controlRevision: 0,
    generation: 0,
    createdAt: new Date().toISOString(),
  };
}

test("private bottle previews and final results agree for every rotated pouring order", () => {
  const e = fixture();
  for (let offset = 0; offset < 8; offset++) {
    e.key = [...choices.slice(offset), ...choices.slice(0, offset)];
    e.phase = "tasting";
    e.revealed = 0;
    const host = publicEvent(e, undefined, true);
    assert.equal(host.hostBottles?.length, 8);
    for (const bottle of host.hostBottles!) {
      assert.ok(
        bottle.name.includes(bottle.type) || bottle.type === "Tempranillo",
      );
      assert.ok(bottle.photoUrl?.includes("host-bottle-photo"));
      assert.ok(bottle.purchaseUrl?.startsWith("https://www.totalwine.com/"));
    }
    const guest = publicEvent(e);
    assert.equal(guest.hostBottles, undefined);
    assert.equal(guest.wines, undefined);
    assert.equal(JSON.stringify(guest).includes("totalwine.com"), false);
    assert.equal(JSON.stringify(guest).includes("host-bottle-photo"), false);
    e.phase = "summary";
    e.revealed = 8;
    e.unlocked = 8;
    for (const result of publicEvent(e).results) {
      const bottle = host.hostBottles!.find((b) => b.type === result.wine)!;
      assert.equal(result.purchaseUrl, bottle.purchaseUrl);
      assert.equal(result.producer, producers[result.wine!]);
      assert.equal(result.wine, e.key[result.round - 1]);
      assert.ok(result.bottlePhoto);
    }
  }
  e.wines![0].producer = "Different actual bottle";
  const changed = publicEvent(e, undefined, true).hostBottles![0];
  assert.equal(changed.photoUrl, undefined);
  assert.equal(changed.purchaseUrl, undefined);
  assert.match(changed.name, /Different actual bottle/);
  e.bottlePhotos = { [choices[0]]: "data:image/jpeg;base64,saved-upload" };
  assert.equal(
    publicEvent(e, undefined, true).hostBottles![0].photoUrl,
    e.bottlePhotos[choices[0]],
  );
  assert.equal(
    publicEvent(e).results.find((w) => w.wine === choices[0])!.bottlePhoto,
    e.bottlePhotos[choices[0]],
  );
});

test("only authenticated hosts can fetch private bottle photos; previews never mutate the event", async () => {
  const dir = mkdtempSync(join(tmpdir(), "host-bottle-test-"));
  process.env.SQLITE_PATH = join(dir, "events.sqlite");
  process.env.HOST_PASSWORD = "local-bottle-test";
  process.env.SESSION_SECRET =
    "local-bottle-test-secret-more-than-thirty-two-characters";
  delete process.env.DATABASE_URL;
  delete process.env.NODE_ENV;
  delete process.env.VERCEL;
  const store = makeStore();
  const e = fixture();
  await store.create(e);
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const url = `${origin}/api/events/${e.id}`;
    const photo = (i: number, cookie?: string) =>
      fetch(`${url}/host-bottle-photo/${i}`, {
        headers: cookie
          ? { Cookie: cookie }
          : { "X-Guest-Token": "a-guest-token-cannot-authenticate-as-host" },
      });
    assert.equal((await photo(0)).status, 401);
    assert.equal(
      (await fetch(`${url}/host-bottle-photo/0?host=1`)).status,
      401,
    );
    const login = await fetch(`${origin}/api/host/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ password: "local-bottle-test" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const before = await store.get(e.id);
    for (let i = 0; i < 8; i++) {
      const response = await photo(i, cookie);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        libraryBottlePhoto(choices[i], producers[choices[i]])!.bytes,
      );
    }
    assert.equal((await photo(-1, cookie)).status, 404);
    assert.equal((await photo(8, cookie)).status, 404);
    assert.equal((await fetch(`${url}/bottle-photo/1`)).status, 404);
    for (const suffix of ["", "?view=projector"]) {
      const guest = await (await fetch(url + suffix)).json();
      assert.equal(guest.hostBottles, undefined);
      assert.equal(JSON.stringify(guest).includes("St. Francis"), false);
    }
    assert.deepEqual(await store.get(e.id), before);
    await store.mutate(e.id, (state) => {
      state.wines![0].producer = "Different bottle";
    });
    assert.equal((await photo(0, cookie)).status, 404);
  } finally {
    await new Promise<void>((r, j) =>
      server.close((err) => (err ? j(err) : r())),
    );
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
