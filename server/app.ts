import { normalizeBottlePhoto } from "./bottle-photo.js";
import { libraryBottlePhoto } from "./bottle-library.js";
import { normalizeAvatarPhoto } from "./avatar-photo.js";
import { ownsSeat } from "./identity.js";
import { validAvatar } from "../src/shared.js";
import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import QRCode from "qrcode";
import {
  eventChoices,
  validation,
  validRating,
  timerRemaining,
  replayDemoId,
  revealGuestDurationMs,
  type Event,
  type Participant,
} from "../src/shared.js";
import { makeStore, type Store } from "./store.js";
import { assistedEvent, csv, publicEvent } from "./results.js";
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function assert(ok: unknown, status: number, message: string): asserts ok {
  if (!ok) throw new HttpError(status, message);
}
function newRevealStage(e: Event) {
  const startsAt = Date.now();
  return {
    round: e.presenting,
    startsAt,
    paradeEndsAt:
      startsAt + 800 + e.participants.length * revealGuestDurationMs,
  };
}
export function createApp(store?: Store) {
  const app = express();
  const password = process.env.HOST_PASSWORD,
    secret = process.env.SESSION_SECRET;
  const configError =
    !password || !secret || secret.length < 32
      ? "Set HOST_PASSWORD (nonempty) and SESSION_SECRET (at least 32 characters) on the server."
      : !process.env.DATABASE_URL &&
          (process.env.VERCEL || process.env.NODE_ENV === "production")
        ? "DATABASE_URL is required for hosted production. Configure persistent PostgreSQL."
        : null;
  const db = store ?? (!configError ? makeStore() : null);
  const base = process.env.BASE_PATH || "";
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    next();
  });
  app.use(base + "/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (configError) return res.status(503).json({ error: configError });
    next();
  });
  const standardJson = express.json({ limit: "16kb" });
  const avatarJson = express.json({ limit: "180kb" });
  app.use((req, res, next) =>
    /\/api\/events\/[a-f0-9]{32}\/(join|avatar|bottle)$/.test(req.path)
      ? avatarJson(req, res, next)
      : standardJson(req, res, next),
  );
  app.use(base + "/api", (req, res, next) => {
    if (req.method !== "GET") {
      const origin = req.get("origin");
      const expected = process.env.PUBLIC_URL
        ? new URL(process.env.PUBLIC_URL).origin
        : `${req.protocol}://${req.get("host")}`;
      if (origin && origin !== expected)
        return res
          .status(403)
          .json({ error: "Request origin is not allowed." });
      if (!req.is("application/json"))
        return res.status(415).json({ error: "Use application/json." });
    }
    next();
  });
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const sign = (s: string) =>
    createHmac("sha256", secret || "")
      .update(s)
      .digest("hex");
  const equal = (a: string, b: string) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const isHost = (req: express.Request) => {
    const cookie =
      req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("tasting_host="))
        ?.slice(13) || "";
    const [exp, sig] = cookie.split(".");
    return !!sig && Number(exp) > Date.now() && equal(sign(exp), sig);
  };
  const host: express.RequestHandler = (req, _res, next) => {
    assert(isHost(req), 401, "Host sign-in required.");
    next();
  };
  const tokenHash = (req: express.Request) => {
    const token = req.get("x-guest-token");
    return token && /^[a-zA-Z0-9-]{32,80}$/.test(token)
      ? hash(token)
      : undefined;
  };
  const id = (req: express.Request) => String(req.params.id);
  const event = async (req: express.Request) => {
    const e = await db!.get(id(req));
    assert(e, 404, "Event not found. Check your invitation link.");
    return e;
  };
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Wait 15 minutes." },
  });
  app.post(base + "/api/host/login", loginLimiter, (req, res) => {
    assert(
      typeof req.body.password === "string" &&
        equal(hash(req.body.password), hash(password!)),
      401,
      "Incorrect host password.",
    );
    const exp = String(Date.now() + 12 * 60 * 60 * 1000);
    res.cookie("tasting_host", `${exp}.${sign(exp)}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || !!process.env.VERCEL,
      sameSite: "strict",
      path: base || "/",
      maxAge: 12 * 60 * 60 * 1000,
    });
    res.json({ ok: true });
  });
  app.post(base + "/api/host/logout", (_req, res) => {
    res.clearCookie("tasting_host", { path: base || "/" });
    res.json({ ok: true });
  });
  app.get(base + "/api/host/events", host, async (_req, res) =>
    res.json((await db!.list()).map((e) => publicEvent(e, undefined, true))),
  );
  app.delete(base + "/api/host/events", host, async (req, res) => {
    assert(
      typeof req.body.password === "string" &&
        equal(hash(req.body.password), hash(password!)),
      401,
      "Incorrect host password.",
    );
    assert(
      req.body.confirmation === "DELETE ALL TASTINGS",
      400,
      "Explicit deletion confirmation is required.",
    );
    const ids = req.body.ids;
    assert(
      Array.isArray(ids) &&
        ids.length <= 10000 &&
        ids.every(
          (value: unknown) =>
            typeof value === "string" && /^[a-f0-9]{32}$/.test(value),
        ),
      400,
      "Provide the tasting IDs to delete.",
    );
    const deleted = await db!.deleteMany([...new Set<string>(ids)]);
    res.json({ deleted });
  });
  app.post(base + "/api/host/events", host, async (req, res) => {
    assert(
      typeof req.body.name === "string" &&
        req.body.name.trim().length > 0 &&
        req.body.name.length <= 100,
      400,
      "Enter an event name (up to 100 characters).",
    );
    const e: Event = {
      id: randomBytes(16).toString("hex"),
      name: req.body.name.trim(),
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
    };
    await db!.create(e);
    res.status(201).json(publicEvent(e, undefined, true));
  });
  app.get(base + "/api/events/:id", async (req, res) => {
    if (req.query.host === "1")
      assert(
        isHost(req),
        401,
        "Host session expired. Reopen host controls to sign in.",
      );
    res.json(
      publicEvent(
        await event(req),
        req.query.view === "projector" ? undefined : tokenHash(req),
        req.query.host === "1",
      ),
    );
  });
  app.get(base + "/api/events/:id/bottle-photo/:round", async (req, res) => {
    const round = Number(req.params.round);
    assert(
      Number.isInteger(round) && round >= 1 && round <= 8,
      404,
      "Photo not available.",
    );
    // Reuse the safe server projection, including countdown concealment.
    // Knowing an event/round URL never bypasses the reveal state.
    const state = publicEvent(await event(req));
    const wine = state.results.find((w) => w.round === round && w.wine);
    assert(wine?.wine && wine.producer, 404, "Photo not available.");
    const photo = libraryBottlePhoto(wine.wine, wine.producer);
    assert(photo, 404, "Photo not available.");
    res.type(photo.mime).send(photo.bytes);
  });
  app.get(base + "/api/events/:id/qr", async (req, res) => {
    await event(req);
    const origin =
      process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}${base}`;
    const url = `${origin.replace(/\/$/, "")}/e/${id(req)}`;
    res.type("svg").send(
      await QRCode.toString(url, {
        type: "svg",
        margin: 3,
        width: 260,
        errorCorrectionLevel: "M",
      }),
    );
  });
  const joinLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many joins. Try again in a minute." },
  });
  app.post(base + "/api/events/:id/join", joinLimiter, async (req, res) => {
    const token = tokenHash(req);
    assert(token, 400, "A valid browser identity token is required.");
    const avatarPhoto = await normalizeAvatarPhoto(req.body.avatarPhoto).catch(
      () => {
        throw new HttpError(
          400,
          "Choose a valid avatar photo. Try a JPEG, PNG or WebP photo.",
        );
      },
    );
    await db!.mutate(id(req), (e) => {
      if (e.participants.some((p) => ownsSeat(p, token))) return;
      assert(
        e.phase === "setup" || e.phase === "tasting",
        423,
        "This tasting is closed to new guests.",
      );
      assert(
        e.participants.length < 50,
        400,
        "This event has reached its guest limit.",
      );
      const { name, emoji = "", avatar = [] } = req.body;
      assert(
        typeof name === "string" &&
          name.trim().length >= 1 &&
          name.trim().length <= 40,
        400,
        "Enter a name (1–40 characters).",
      );
      assert(
        !e.participants.some(
          (p) => p.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
        ),
        409,
        "That name is already in use. Add your last initial or a nickname. Reopen in your original browser to recover your scorecard.",
      );
      assert(
        typeof emoji === "string" &&
          ["🍷", "🍇", "✨", "🌙", "🥂", "🦊", "🎩", ""].includes(emoji),
        400,
        "Choose an available emoji.",
      );
      assert(
        validAvatar(avatar),
        400,
        "Invalid drawing. Clear it and try again.",
      );
      e.participants.push({
        id: randomBytes(12).toString("hex"),
        name: name.trim(),
        emoji,
        avatar,
        avatarPhoto,
        tokenHash: token,
        draftScope: true,
        entries: {},
        submitted: false,
      });
    });
    res.json(publicEvent(await event(req), token));
  });
  const recoveryRoomLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 150,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip || "")}:${id(req)}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error:
        "Too many recovery attempts for this event. Ask your host for help or wait 15 minutes.",
    },
  });
  const recoveryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    keyGenerator: (req) =>
      `${ipKeyGenerator(req.ip || "")}:${id(req)}:${tokenHash(req) || "anonymous"}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error:
        "Too many recovery attempts. Wait 15 minutes or ask your host for help.",
    },
  });
  // Recovery credentials stay in the event's private persisted state. GETs never grant access.
  const attachSession = (e: Event, participantId: string, token: string) => {
    const seat = e.participants.find((p) => p.id === participantId);
    assert(seat, 404, "This guest is no longer at the table.");
    assert(
      !e.participants.some((p) => p.id !== seat.id && ownsSeat(p, token)),
      409,
      "This browser already belongs to another guest. Use a separate browser or private tab.",
    );
    if (!ownsSeat(seat, token))
      seat.tokenAliases = [...(seat.tokenAliases || []), token];
  };
  const pruneRecovery = (e: Event) => {
    const now = Date.now();
    e.recoveryRequests = (e.recoveryRequests || []).filter(
      (r) =>
        r.expiresAt > now &&
        e.participants.some((p) => p.id === r.participantId),
    );
    e.recoveryLinks = (e.recoveryLinks || []).filter(
      (r) =>
        r.expiresAt > now &&
        e.participants.some((p) => p.id === r.participantId),
    );
  };
  app.post(
    base + "/api/events/:id/recover",
    recoveryRoomLimiter,
    recoveryLimiter,
    async (req, res) => {
      const token = tokenHash(req);
      assert(token, 400, "A valid browser identity token is required.");
      assert(
        typeof req.body.participantId === "string",
        400,
        "Choose your existing seat. Your host must approve recovery.",
      );
      const result = await db!.mutate(id(req), (e) => {
        pruneRecovery(e);
        const seat = e.participants.find(
          (p) => p.id === req.body.participantId,
        );
        assert(seat, 404, "This guest is no longer at the table.");
        assert(
          !e.participants.some((p) => ownsSeat(p, token)),
          409,
          "This browser already has a seat. Reopen the event or use a separate browser.",
        );
        const existing = e.recoveryRequests!.find(
          (r) => r.tokenHash === token && r.status === "pending",
        );
        assert(
          !existing || existing.participantId === seat.id,
          409,
          "You already have a pending request. Wait for your host to respond.",
        );
        if (existing)
          return { status: existing.status, expiresAt: existing.expiresAt };
        assert(
          e.recoveryRequests!.filter((r) => r.status === "pending").length <
            100,
          429,
          "Too many pending requests. Ask your host for a recovery link.",
        );
        const request = {
          id: randomBytes(16).toString("hex"),
          participantId: seat.id,
          tokenHash: token,
          status: "pending" as const,
          createdAt: Date.now(),
          expiresAt: Date.now() + 15 * 60 * 1000,
        };
        e.recoveryRequests!.push(request);
        return { status: request.status, expiresAt: request.expiresAt };
      });
      res.json(result);
    },
  );
  app.get(base + "/api/events/:id/recovery", async (req, res) => {
    const token = tokenHash(req);
    assert(token, 401, "A valid browser identity token is required.");
    const e = await event(req);
    const request = e.recoveryRequests
      ?.filter((r) => r.tokenHash === token)
      .at(-1);
    const seat =
      request && e.participants.find((p) => p.id === request.participantId);
    const status = !request
      ? "none"
      : !seat || request.expiresAt <= Date.now()
        ? "expired"
        : request.status;
    res.json({
      status,
      name: seat?.name,
      participantId: seat?.id,
      expiresAt: request?.expiresAt,
    });
  });
  app.post(
    base + "/api/events/:id/recovery/:requestId",
    host,
    async (req, res) => {
      assert(
        ["approve", "deny"].includes(req.body.decision),
        400,
        "Choose Approve or Deny.",
      );
      await db!.mutate(id(req), (e) => {
        const request = e.recoveryRequests?.find(
          (r) => r.id === req.params.requestId,
        );
        assert(
          request && request.expiresAt > Date.now(),
          410,
          "This recovery request has expired.",
        );
        assert(
          request.status === "pending",
          409,
          "This request has already been answered.",
        );
        if (req.body.decision === "approve")
          attachSession(e, request.participantId, request.tokenHash);
        request.status =
          req.body.decision === "approve" ? "approved" : "denied";
      });
      res.json(publicEvent(await event(req), undefined, true));
    },
  );
  app.post(base + "/api/events/:id/recovery-link", host, async (req, res) => {
    const secret = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await db!.mutate(id(req), (e) => {
      pruneRecovery(e);
      const seat = e.participants.find((p) => p.id === req.body.participantId);
      assert(seat, 404, "This guest is no longer at the table.");
      // A new link replaces unused links for this seat, without revoking authenticated sessions.
      e.recoveryLinks = e.recoveryLinks!.filter(
        (r) => r.participantId !== seat.id,
      );
      e.recoveryLinks.push({
        participantId: seat.id,
        secretHash: hash(secret),
        expiresAt,
      });
    });
    res.json({ path: `${base}/e/${id(req)}#recover=${secret}`, expiresAt });
  });
  app.post(
    base + "/api/events/:id/recovery-link/redeem",
    recoveryRoomLimiter,
    recoveryLimiter,
    async (req, res) => {
      const token = tokenHash(req);
      assert(token, 400, "A valid browser identity token is required.");
      assert(
        typeof req.body.secret === "string" &&
          /^[a-f0-9]{64}$/.test(req.body.secret),
        400,
        "This recovery link is invalid.",
      );
      await db!.mutate(id(req), (e) => {
        const index = e.recoveryLinks?.findIndex(
          (r) => r.secretHash === hash(req.body.secret),
        );
        assert(
          index !== undefined && index >= 0,
          410,
          "This recovery link has expired or was already used. Ask your host for a new link.",
        );
        const recovery = e.recoveryLinks![index];
        assert(
          recovery.expiresAt > Date.now(),
          410,
          "This recovery link has expired. Ask your host for a new link.",
        );
        attachSession(e, recovery.participantId, token);
        e.recoveryLinks!.splice(index, 1);
      });
      res.json(publicEvent(await event(req), token));
    },
  );
  app.put(base + "/api/events/:id/avatar", async (req, res) => {
    const token = tokenHash(req);
    assert(token, 401, "Join this event first.");
    const avatar = req.body.avatar ?? [];
    const avatarPhoto = await normalizeAvatarPhoto(req.body.avatarPhoto).catch(
      () => {
        throw new HttpError(
          400,
          "Choose a valid avatar photo. Try a JPEG, PNG or WebP photo.",
        );
      },
    );
    assert(
      validAvatar(avatar),
      400,
      "Invalid drawing. Clear it and try again.",
    );
    await db!.mutate(id(req), (e) => {
      assert(
        e.phase === "setup" || e.phase === "tasting",
        423,
        "Avatars are locked with submissions.",
      );
      const p = e.participants.find((p) => ownsSeat(p, token));
      assert(p, 401, "Join this event first.");
      assert(
        avatar.length > 0 || !!avatarPhoto,
        400,
        "Draw or upload an avatar before saving your icon.",
      );
      p.avatar = avatar;
      p.avatarPhoto = avatarPhoto;
      p.emoji = "";
    });
    res.json(publicEvent(await event(req), token));
  });
  app.put(base + "/api/events/:id/practice", async (req, res) => {
    const token = tokenHash(req);
    assert(token, 401, "Join this event first.");
    await db!.mutate(id(req), (e) => {
      assert(
        e.phase === "setup",
        423,
        "Practice has ended. The tasting is starting.",
      );
      const p = e.participants.find((p) => ownsSeat(p, token));
      assert(p, 401, "Join this event first.");
      assert(
        req.body.revision === (p.practice?.revision ?? 0),
        409,
        "Practice changed in another tab. Reload the saved version before editing.",
      );
      const { guess, rating, notes } = req.body;
      assert(
        guess === "" || eventChoices(e).includes(guess),
        400,
        "Select an available wine type.",
      );
      assert(
        rating === null || validRating(rating),
        400,
        "Rating must be 1.0–10.0 in 0.1 increments, or blank.",
      );
      assert(
        typeof notes === "string" && notes.length <= 2000,
        400,
        "Notes can be up to 2,000 characters.",
      );
      p.practice = {
        guess,
        rating,
        notes,
        revision: (p.practice?.revision ?? 0) + 1,
      };
    });
    res.json(publicEvent(await event(req), token));
  });
  // Both entry paths share the same validation, revisions and submission invalidation.
  function saveScoredEntry(
    e: Event,
    p: Participant,
    round: number,
    body: Record<string, unknown>,
    assisted: boolean,
  ) {
    const previous = p.entries[round];
    assert(
      body.revision === (previous?.revision ?? 0),
      409,
      "This round changed on another device. Load the latest saved version before editing.",
    );
    const { guess, rating } = body;
    const notes = assisted ? (previous?.notes ?? "") : body.notes;
    assert(
      typeof guess === "string" &&
        (guess === "" || eventChoices(e).includes(guess)),
      400,
      "Select an available wine type.",
    );
    assert(
      rating === null || validRating(rating),
      400,
      "Rating must be 1.0–10.0 in 0.1 increments, or blank.",
    );
    assert(
      typeof notes === "string" && notes.length <= 2000,
      400,
      "Notes can be up to 2,000 characters.",
    );
    p.entries[round] = {
      guess,
      rating,
      notes,
      revision: (previous?.revision ?? 0) + 1,
      ...(assisted ? { enteredBy: "host" as const } : {}),
    };
    if (!validation(p.entries, eventChoices(e)).valid) p.submitted = false;
  }
  function submitScoredCard(e: Event, p: Participant) {
    assert(
      e.phase === "tasting" && e.unlocked === 8,
      423,
      "All eight rounds must be open and submissions unlocked.",
    );
    assert(
      validation(p.entries, eventChoices(e)).valid,
      400,
      "Complete eight guesses and ratings using every wine type exactly once.",
    );
    p.submitted = true;
  }
  app.get(base + "/api/events/:id/assisted", host, async (req, res) => {
    res.json(assistedEvent(await event(req)));
  });
  app.put(
    base + "/api/events/:id/assisted/:participantId/entries/:round",
    host,
    async (req, res) => {
      await db!.mutate(id(req), (e) => {
        assert(
          e.phase === "tasting",
          423,
          "Submissions are not open. Your last confirmed saves are preserved.",
        );
        const round = Number(req.params.round);
        assert(
          Number.isInteger(round) && round >= 1 && round <= e.unlocked,
          403,
          "This round has not been unlocked.",
        );
        assert(
          req.body.generation === (e.generation ?? 0),
          409,
          "This tasting was reset. Load its current scorecards.",
        );
        const p = e.participants.find((p) => p.id === req.params.participantId);
        assert(p, 404, "This guest is no longer registered.");
        saveScoredEntry(e, p, round, req.body, true);
      });
      res.json(assistedEvent(await event(req)));
    },
  );
  app.post(
    base + "/api/events/:id/assisted/:participantId/submit",
    host,
    async (req, res) => {
      await db!.mutate(id(req), (e) => {
        const p = e.participants.find((p) => p.id === req.params.participantId);
        assert(p, 404, "This guest is no longer registered.");
        assert(
          req.body.generation === (e.generation ?? 0) &&
            Array.isArray(req.body.entryRevisions) &&
            req.body.entryRevisions.length === 8 &&
            req.body.entryRevisions.every(
              (revision: unknown, i: number) =>
                revision === (p.entries[i + 1]?.revision ?? 0),
            ),
          409,
          "The scorecard changed. Review the latest answers before submitting.",
        );
        submitScoredCard(e, p);
      });
      res.json(assistedEvent(await event(req)));
    },
  );
  app.put(base + "/api/events/:id/entries/:round", async (req, res) => {
    const token = tokenHash(req);
    assert(token, 401, "Join this event first.");
    await db!.mutate(id(req), (e) => {
      assert(
        e.phase === "tasting",
        423,
        "Submissions are not open. Your last confirmed saves are preserved.",
      );
      const round = Number(req.params.round);
      assert(
        Number.isInteger(round) && round >= 1 && round <= e.unlocked,
        403,
        "This round has not been unlocked.",
      );
      const p = e.participants.find((p) => ownsSeat(p, token));
      assert(p, 401, "Join this event first.");
      saveScoredEntry(e, p, round, req.body, false);
    });
    res.json(publicEvent(await event(req), token));
  });
  app.post(base + "/api/events/:id/submit", async (req, res) => {
    const token = tokenHash(req);
    await db!.mutate(id(req), (e) => {
      assert(
        e.phase === "tasting" && e.unlocked === 8,
        423,
        "All eight rounds must be open and submissions unlocked.",
      );
      const p = e.participants.find((p) => ownsSeat(p, token));
      assert(p, 401, "Join first.");
      submitScoredCard(e, p);
    });
    res.json(publicEvent(await event(req), token));
  });
  app.put(base + "/api/events/:id/bottle", host, async (req, res) => {
    const photo = await normalizeBottlePhoto(req.body.photo).catch(
      (err: Error) => {
        throw new HttpError(400, err.message);
      },
    );
    await db!.mutate(id(req), (e) => {
      assert(
        e.phase === "setup",
        423,
        "Bottle photos are frozen after starting.",
      );
      assert(
        req.body.revision === (e.controlRevision ?? 0),
        409,
        "The event changed. Review the latest state and try again.",
      );
      assert(
        typeof req.body.wine === "string" &&
          eventChoices(e).includes(req.body.wine),
        400,
        "Choose a current wine type.",
      );
      e.bottlePhotos ??= {};
      if (photo) e.bottlePhotos = { ...e.bottlePhotos, [req.body.wine]: photo };
      else delete e.bottlePhotos[req.body.wine];
      e.controlRevision = (e.controlRevision ?? 0) + 1;
    });
    res.json(publicEvent(await event(req), undefined, true));
  });
  app.post(base + "/api/events/:id/control", host, async (req, res) => {
    await db!.mutate(id(req), (e) => {
      assert(
        req.body.revision === (e.controlRevision ?? 0),
        409,
        "The event changed. Review the latest state and try again.",
      );
      const { action } = req.body;
      if (action === "correctKey") {
        assert(
          (e.phase === "tasting" || e.phase === "locked") && e.revealed === 0,
          423,
          "Pouring order can only be corrected after starting and before the first reveal.",
        );
        assert(
          req.body.confirm === e.name,
          400,
          "Type the exact event name to confirm the correction.",
        );
        const { key, reason } = req.body;
        assert(
          Array.isArray(key) &&
            key.length === 8 &&
            new Set(key).size === 8 &&
            key.every(
              (w: unknown) =>
                typeof w === "string" && eventChoices(e).includes(w),
            ),
          400,
          "Assign each wine type exactly once.",
        );
        assert(
          typeof reason === "string" &&
            reason.trim().length > 0 &&
            reason.trim().length <= 300,
          400,
          "Explain the correction in up to 300 characters.",
        );
        assert(
          JSON.stringify(key) !== JSON.stringify(e.key),
          400,
          "Change the pouring order before saving a correction.",
        );
        (e.keyCorrections ??= []).push({
          at: new Date().toISOString(),
          generation: e.generation ?? 0,
          before: [...e.key],
          after: [...key],
          reason: reason.trim(),
        });
        e.key = [...key];
      } else if (
        ["timerStart", "timerPause", "timerResume", "timerStop"].includes(
          action,
        )
      ) {
        assert(
          e.phase === "tasting",
          423,
          "The round timer is only available during tasting.",
        );
        if (action === "timerStart") {
          const seconds = req.body.seconds;
          assert(
            Number.isInteger(seconds) && seconds >= 30 && seconds <= 3600,
            400,
            "Choose a timer between 30 seconds and 60 minutes.",
          );
          e.roundTimer = {
            round: e.unlocked,
            durationMs: seconds * 1000,
            remainingMs: seconds * 1000,
            endsAt: Date.now() + seconds * 1000,
          };
        } else if (action === "timerStop") {
          delete e.roundTimer;
        } else {
          const timer = e.roundTimer;
          assert(
            timer && timer.round === e.unlocked,
            400,
            "Start a timer for this round first.",
          );
          const remaining = timerRemaining(timer, Date.now());
          assert(
            remaining > 0,
            400,
            "This timer has ended. Start a new timer.",
          );
          if (action === "timerPause") {
            assert(
              timer.endsAt !== undefined,
              400,
              "The timer is already paused.",
            );
            timer.remainingMs = remaining;
            delete timer.endsAt;
          } else {
            assert(
              timer.endsAt === undefined,
              400,
              "The timer is already running.",
            );
            timer.endsAt = Date.now() + remaining;
          }
        }
      } else if (action === "seating") {
        const seating = req.body.seating;
        assert(
          seating &&
            ["round", "square", "rectangle"].includes(seating.shape) &&
            Array.isArray(seating.seats) &&
            seating.seats.length >= 2 &&
            seating.seats.length <= 20,
          400,
          "Choose a table shape and between 2 and 20 seats.",
        );
        const assigned = seating.seats.filter((s: unknown) => s !== null);
        assert(
          assigned.every(
            (s: unknown) =>
              typeof s === "string" && e.participants.some((p) => p.id === s),
          ) && new Set(assigned).size === assigned.length,
          400,
          "Assign each current guest to at most one seat.",
        );
        e.seating = { shape: seating.shape, seats: [...seating.seats] };
      } else if (action === "wines") {
        assert(
          e.phase === "setup",
          423,
          "Wine choices are frozen. Use the explicit reset flow to start over.",
        );
        const wines = req.body.wines;
        assert(
          Array.isArray(wines) &&
            wines.length === 8 &&
            wines.every(
              (w: unknown) =>
                w &&
                typeof w === "object" &&
                typeof (w as { type?: unknown }).type === "string" &&
                typeof (w as { producer?: unknown }).producer === "string",
            ),
          400,
          "Enter eight wine types and their producers.",
        );
        const clean = wines.map((w: { type: string; producer: string }) => ({
          type: w.type.trim(),
          producer: w.producer.trim(),
        }));
        assert(
          clean.every(
            (w: { type: string; producer: string }) =>
              w.type.length >= 1 &&
              w.type.length <= 80 &&
              w.producer.length >= 1 &&
              w.producer.length <= 120 &&
              w.type.toLowerCase() !== "no guess",
          ) &&
            new Set(
              clean.map((w: { type: string }) => w.type.toLocaleLowerCase()),
            ).size === 8,
          400,
          "Use eight distinct wine types (up to 80 characters) and a producer for each (up to 120 characters).",
        );
        e.wines = clean;
        if (e.bottlePhotos)
          e.bottlePhotos = Object.fromEntries(
            Object.entries(e.bottlePhotos).filter(([wine]) =>
              eventChoices(e).includes(wine),
            ),
          );
        if (e.key.some((w) => !eventChoices(e).includes(w))) e.key = [];
      } else if (action === "key") {
        assert(
          e.phase === "setup",
          423,
          "Answer key is frozen. Use the explicit reset flow to start over.",
        );
        assert(
          Array.isArray(req.body.key) &&
            req.body.key.length === 8 &&
            new Set(req.body.key).size === 8 &&
            req.body.key.every((w: string) => eventChoices(e).includes(w)),
          400,
          "Assign each wine type exactly once.",
        );
        e.key = req.body.key;
      } else if (action === "start") {
        assert(
          e.phase === "setup" && e.key.length === 8,
          400,
          "Save a valid answer key before starting.",
        );
        e.phase = "tasting";
        e.unlocked = 1;
      } else if (action === "unlock") {
        assert(
          e.phase === "tasting" && e.unlocked < 8,
          400,
          "No next tasting round is available.",
        );
        e.unlocked++;
        delete e.roundTimer;
      } else if (action === "lock") {
        assert(
          e.phase === "tasting" && e.unlocked === 8,
          400,
          "Unlock all eight rounds before locking.",
        );
        const affected = e.participants.filter(
          (p) => !p.submitted || !validation(p.entries, eventChoices(e)).valid,
        );
        assert(
          !affected.length || req.body.override === true,
          409,
          `Not ready: ${affected.map((p) => p.name).join(", ")}. Review incomplete scorecards or explicitly override.`,
        );
        delete e.roundTimer;
        e.phase = "locked";
        e.presenting = 1;
        e.revealStage = newRevealStage(e);
      } else if (action === "reveal") {
        assert(
          e.phase === "locked" &&
            e.presenting === e.revealed + 1 &&
            e.revealed < 8,
          400,
          "Select the next round before revealing.",
        );
        assert(
          req.body.countdown === undefined ||
            typeof req.body.countdown === "boolean",
          400,
          "Choose whether to use a countdown.",
        );
        assert(
          req.body.staged === undefined || typeof req.body.staged === "boolean",
          400,
          "Choose staged reveal timing.",
        );
        const startsAt =
          req.body.staged === true
            ? Math.max(Date.now(), e.revealStage?.paradeEndsAt ?? 0)
            : Date.now();
        e.revealed++;
        const endsAt = startsAt + (req.body.countdown === true ? 3000 : 0);
        if (endsAt > Date.now())
          e.revealCountdown = { round: e.revealed, startsAt, endsAt };
        else delete e.revealCountdown;
      } else if (action === "next") {
        assert(
          !e.revealCountdown || e.revealCountdown.endsAt <= Date.now(),
          409,
          "Wait for the reveal countdown to finish.",
        );
        assert(
          e.phase === "locked" && e.presenting === e.revealed && e.revealed < 8,
          400,
          "Reveal this round first.",
        );
        e.presenting++;
        e.revealStage = newRevealStage(e);
      } else if (action === "summary") {
        assert(
          !e.revealCountdown || e.revealCountdown.endsAt <= Date.now(),
          409,
          "Wait for the reveal countdown to finish.",
        );
        assert(
          e.phase === "locked" && e.revealed === 8,
          400,
          "Reveal all eight wines first.",
        );
        e.phase = "summary";
      } else if (action === "replayDemo") {
        assert(
          e.id === replayDemoId,
          403,
          "Replay is only available for the fictional demo.",
        );
        assert(
          e.phase === "summary" && e.revealed === 8,
          409,
          "Finish the demo before replaying its final reveal.",
        );
        assert(
          req.body.confirm === e.name,
          400,
          "Confirm the demo name before replaying.",
        );
        e.phase = "locked";
        e.revealed = 7;
        e.presenting = 8;
        delete e.revealCountdown;
        e.revealStage = newRevealStage(e);
      } else if (action === "remove") {
        const index = e.participants.findIndex(
          (p) => p.id === req.body.participantId,
        );
        assert(index >= 0, 404, "This guest is no longer at the table.");
        assert(
          req.body.confirm === e.participants[index].name,
          400,
          "Confirm the guest’s name before removing them.",
        );
        if (e.seating)
          e.seating.seats = e.seating.seats.map((seat) =>
            seat === req.body.participantId ? null : seat,
          );
        e.participants.splice(index, 1);
        e.recoveryRequests = e.recoveryRequests?.filter(
          (r) => r.participantId !== req.body.participantId,
        );
        e.recoveryLinks = e.recoveryLinks?.filter(
          (r) => r.participantId !== req.body.participantId,
        );
      } else if (action === "reset") {
        assert(
          req.body.confirm === e.name,
          400,
          "Type the exact event name to confirm.",
        );
        assert(
          e.revealed === 0,
          423,
          "Revealed events cannot be reset. Create a new event.",
        );
        delete e.roundTimer;
        delete e.revealCountdown;
        delete e.revealStage;
        e.generation = (e.generation ?? 0) + 1;
        e.phase = "setup";
        e.key = [];
        e.unlocked = 0;
        e.presenting = 0;
        e.revealed = 0;
        e.participants.forEach((p) => {
          delete p.practice;
          p.entries = {};
          p.submitted = false;
        });
      } else throw new HttpError(400, "Unknown host action.");
      e.controlRevision = (e.controlRevision ?? 0) + 1;
    });
    res.json(publicEvent(await event(req), undefined, true));
  });
  app.get(base + "/api/events/:id/export", host, async (req, res) => {
    const e = await event(req);
    assert(
      e.phase === "locked" || e.phase === "summary",
      423,
      "Lock submissions before exporting.",
    );
    res.set(
      "Content-Disposition",
      `attachment; filename="tasting-${e.id}.csv"`,
    );
    res.type("text/csv; charset=utf-8").send("\uFEFF" + csv(e));
  });
  app.get(base + "/api/health", async (_req, res) => {
    await db!.list();
    res.json({
      ok: true,
      storage: process.env.DATABASE_URL
        ? "postgresql"
        : "local SQLite rehearsal",
    });
  });
  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (!(err instanceof HttpError))
        console.error("Tasting request failed:", err.message);
      res
        .status(
          err instanceof HttpError
            ? err.status
            : err.message === "Event not found"
              ? 404
              : 500,
        )
        .json({
          error:
            err instanceof HttpError
              ? err.message
              : "The server could not complete this request. Please retry.",
        });
    },
  );
  return app;
}
