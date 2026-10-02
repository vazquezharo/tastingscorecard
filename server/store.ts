import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pg from "pg";
import type { Event } from "../src/shared.js";
export interface Store {
  create(e: Event): Promise<void>;
  get(id: string): Promise<Event | null>;
  list(): Promise<Event[]>;
  mutate<T>(id: string, fn: (e: Event) => T): Promise<T>;
  deleteMany(ids: string[]): Promise<number>;
  close(): Promise<void>;
}
export function makeStore(): Store {
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 10000,
    });
    let initialization: Promise<pg.QueryResult> | undefined;
    const ready = () =>
      (initialization ??= pool
        .query(
          "CREATE TABLE IF NOT EXISTS tasting_events (id TEXT PRIMARY KEY, data JSONB NOT NULL)",
        )
        .catch((error) => {
          initialization = undefined;
          throw error;
        }));
    return {
      async create(e) {
        await ready();
        await pool.query("INSERT INTO tasting_events VALUES ($1,$2)", [
          e.id,
          JSON.stringify(e),
        ]);
      },
      async get(id) {
        await ready();
        return (
          (
            await pool.query("SELECT data FROM tasting_events WHERE id=$1", [
              id,
            ])
          ).rows[0]?.data ?? null
        );
      },
      async list() {
        await ready();
        return (
          await pool.query(
            "SELECT data FROM tasting_events ORDER BY data->>'createdAt' DESC",
          )
        ).rows.map((r) => r.data);
      },
      async mutate(id, fn) {
        await ready();
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const e = (
            await c.query(
              "SELECT data FROM tasting_events WHERE id=$1 FOR UPDATE",
              [id],
            )
          ).rows[0]?.data;
          if (!e) throw new Error("Event not found");
          const result = fn(e);
          e.revision++;
          await c.query("UPDATE tasting_events SET data=$2 WHERE id=$1", [
            id,
            JSON.stringify(e),
          ]);
          await c.query("COMMIT");
          return result;
        } catch (err) {
          await c.query("ROLLBACK");
          throw err;
        } finally {
          c.release();
        }
      },
      async deleteMany(ids) {
        await ready();
        const result = await pool.query(
          "DELETE FROM tasting_events WHERE id = ANY($1::text[])",
          [ids],
        );
        return result.rowCount ?? 0;
      },
      async close() {
        await pool.end();
      },
    };
  }
  if (process.env.VERCEL || process.env.NODE_ENV === "production")
    throw new Error(
      "DATABASE_URL is required for hosted production. Configure a persistent PostgreSQL database.",
    );
  const file = process.env.SQLITE_PATH || "data/rehearsal.sqlite";
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS tasting_events (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
  );
  const get = (id: string) => {
    const row = db
      .prepare("SELECT data FROM tasting_events WHERE id=?")
      .get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Event) : null;
  };
  return {
    async create(e) {
      db.prepare("INSERT INTO tasting_events VALUES (?,?)").run(
        e.id,
        JSON.stringify(e),
      );
    },
    async get(id) {
      return get(id);
    },
    async list() {
      return db
        .prepare("SELECT data FROM tasting_events ORDER BY rowid DESC")
        .all()
        .map((r) => JSON.parse(r.data as string));
    },
    async mutate(id, fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const e = get(id);
        if (!e) throw new Error("Event not found");
        const result = fn(e);
        e.revision++;
        db.prepare("UPDATE tasting_events SET data=? WHERE id=?").run(
          JSON.stringify(e),
          id,
        );
        db.exec("COMMIT");
        return result;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    async deleteMany(ids) {
      db.exec("BEGIN IMMEDIATE");
      try {
        let count = 0;
        const remove = db.prepare("DELETE FROM tasting_events WHERE id=?");
        for (const id of ids) count += Number(remove.run(id).changes);
        db.exec("COMMIT");
        return count;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async close() {
      db.close();
    },
  };
}
