import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeStore } from "../server/store.ts";
import { publicEvent } from "../server/results.ts";
import { choices, type Event } from "../src/shared.ts";

test("table seating survives store reopen; readiness uses only valid saved current-round answers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "seating-test-"));
  process.env.SQLITE_PATH = join(dir, "event.sqlite");
  delete process.env.DATABASE_URL;
  const event: Event = {
    id: "seat-fixture",
    name: "Table fixture",
    key: [...choices],
    phase: "tasting",
    unlocked: 1,
    revealed: 0,
    presenting: 0,
    revision: 0,
    controlRevision: 0,
    generation: 0,
    createdAt: new Date().toISOString(),
    seating: { shape: "rectangle", seats: ["guest", null] },
    participants: [
      {
        id: "guest",
        name: "Alex",
        emoji: "",
        tokenHash: "private-token",
        recoveryHash: "private-pin",
        submitted: false,
        entries: {
          "1": {
            guess: choices[0],
            rating: 8.3,
            notes: "private notes",
            revision: 1,
          },
        },
      },
    ],
  };
  let store = makeStore();
  try {
    await store.create(event);
    await store.close();
    store = makeStore();
    const saved = (await store.get(event.id))!;
    assert.deepEqual(saved.seating, event.seating);
    const publicState = publicEvent(saved);
    assert.equal(publicState.tableGuests[0].ready, true);
    assert.equal(publicState.key, undefined);
    assert.equal(publicState.roster, undefined);
    for (const hidden of [
      "private-token",
      "private-pin",
      "private notes",
      "St. Francis",
    ])
      assert.equal(JSON.stringify(publicState).includes(hidden), false);
    saved.unlocked = 2;
    assert.equal(publicEvent(saved).tableGuests[0].ready, false);
    saved.unlocked = 1;
    saved.participants[0].entries[1].rating = null;
    assert.equal(publicEvent(saved).tableGuests[0].ready, false);
    saved.participants[0].entries[1].rating = 8.35;
    assert.equal(publicEvent(saved).tableGuests[0].ready, false);
    saved.participants[0].entries[1].rating = 8;
    saved.participants[0].entries[1].guess = "Unknown wine";
    assert.equal(publicEvent(saved).tableGuests[0].ready, false);
  } finally {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
