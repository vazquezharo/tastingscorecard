// Local-only, fictional browser fixture. No production credentials or writes.
import { makeStore } from "../server/store.ts";
import { tonight } from "../server/tonight-bottles.ts";
import { choices, type Event } from "../src/shared.ts";
if (
  process.env.DATABASE_URL ||
  process.env.VERCEL ||
  process.env.NODE_ENV === "production"
)
  throw new Error("Local rehearsal only");
if (!process.env.SQLITE_PATH?.startsWith("/tmp/") || !process.env.HOST_PASSWORD)
  throw new Error("Explicit disposable database and password required");
const store = makeStore();
const id = "b".repeat(32);
if (await store.get(id))
  throw new Error("Use a fresh disposable database for this fixture");
await store.create({
  id,
  name: "Fictional · Signature reveal rehearsal",
  key: [],
  phase: "setup",
  unlocked: 0,
  revealed: 0,
  presenting: 0,
  revision: 0,
  controlRevision: 0,
  generation: 0,
  participants: [],
  createdAt: new Date().toISOString(),
} satisfies Event);
await store.close();
tonight.eventId = id;
tonight.bottles = choices.map((type, i) => ({
  type,
  producer: `Fictional exact bottle ${i + 1}`,
  ...(i === 0
    ? {
        image: "https://images.example/fictional-bottle.jpg",
        purchaseUrl: "https://shop.example/fictional-bottle",
      }
    : i === 1
      ? { image: "https://images.example/missing.jpg" }
      : {}),
}));
await import("../server/index.ts");
