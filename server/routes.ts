import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { storage } from "./storage";
import {
  credentialsSchema,
  progressItemSchema,
  bulkProgressSchema,
  friendRequestSchema,
  showcaseSchema,
  usernameSchema,
  SHOWCASE_MAX,
  type User,
} from "@shared/schema";
import rosterData from "@shared/spriteData.json";

const SEASON_ID: string = (rosterData as any).season.id;

/**
 * Every variant the current roster actually defines. Rows can outlive a roster
 * change (a finish gets renamed, a sprite is pulled), and the client only ever
 * counts what the roster lists — so the server has to filter the same way, or
 * a friend's headline count would disagree with their own board.
 */
const ROSTER_VARIANTS: Set<string> = new Set(
  ((rosterData as any).sprites as { id: string; finishes: string[] }[]).flatMap((s) =>
    s.finishes.map((f) => `${s.id}:${f}`),
  ),
);

function countRosterVariants(rows: { spriteId: string; finishId: string; status: string }[]) {
  let collected = 0;
  let mastered = 0;
  for (const row of rows) {
    if (!ROSTER_VARIANTS.has(`${row.spriteId}:${row.finishId}`)) continue;
    collected += 1;
    if (row.status === "mastered") mastered += 1;
  }
  return { collected, mastered };
}

type AuthedRequest = Request & { user?: User; token?: string };

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Not signed in" });
  const user = await storage.getUserByToken(token);
  if (!user) return res.status(401).json({ message: "Session expired — sign in again" });
  req.user = user;
  req.token = token;
  next();
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.get("/api/roster", (_req, res) => {
    res.json(rosterData);
  });

  app.post("/api/auth/register", async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    const { username, pin } = parsed.data;
    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ message: "That username is already taken" });
    }
    const user = await storage.createUser(username, pin);
    const token = await storage.createSession(user.id);
    res.json({ token, username: user.username });
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    const { username, pin } = parsed.data;
    const user = await storage.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({ message: "No pod found for that username" });
    }
    if (!storage.verifyPin(user, pin)) {
      return res.status(401).json({ message: "Wrong PIN" });
    }
    const token = await storage.createSession(user.id);
    res.json({ token, username: user.username });
  });

  app.post("/api/auth/logout", requireAuth, async (req: AuthedRequest, res) => {
    await storage.deleteSession(req.token!);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthedRequest, res) => {
    res.json({ username: req.user!.username });
  });

  app.get("/api/progress", requireAuth, async (req: AuthedRequest, res) => {
    const entries = await storage.getEntries(req.user!.id, SEASON_ID);
    res.json({ seasonId: SEASON_ID, username: req.user!.username, entries });
  });

  app.put("/api/progress", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = progressItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    await storage.upsertEntry(req.user!.id, SEASON_ID, parsed.data);
    const entries = await storage.getEntries(req.user!.id, SEASON_ID);
    res.json({ seasonId: SEASON_ID, entries });
  });

  app.post("/api/progress/bulk", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = bulkProgressSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    for (const item of parsed.data.entries) {
      await storage.upsertEntry(req.user!.id, SEASON_ID, item);
    }
    const entries = await storage.getEntries(req.user!.id, SEASON_ID);
    res.json({ seasonId: SEASON_ID, entries });
  });

  app.post("/api/progress/reset", requireAuth, async (req: AuthedRequest, res) => {
    await storage.resetSeason(req.user!.id, SEASON_ID);
    res.json({ seasonId: SEASON_ID, entries: [] });
  });

  // ---- showcase ---------------------------------------------------------

  app.get("/api/showcase", requireAuth, async (req: AuthedRequest, res) => {
    res.json({ max: SHOWCASE_MAX, items: await storage.getShowcase(req.user!.id, SEASON_ID) });
  });

  app.put("/api/showcase", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = showcaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    const items = parsed.data.items.filter((i) =>
      ROSTER_VARIANTS.has(`${i.spriteId}:${i.finishId}`),
    );
    await storage.setShowcase(req.user!.id, SEASON_ID, items);
    res.json({ max: SHOWCASE_MAX, items: await storage.getShowcase(req.user!.id, SEASON_ID) });
  });

  // ---- friends ----------------------------------------------------------

  /**
   * Everything the Friends screen needs in one round trip: accepted friends
   * with their season counts and showcase, plus both directions of pending
   * requests.
   */
  app.get("/api/friends", requireAuth, async (req: AuthedRequest, res) => {
    const me = req.user!;
    const rows = await storage.listFriendships(me.id);

    const friends = [];
    const incoming = [];
    const outgoing = [];

    for (const row of rows) {
      const otherId = row.requesterId === me.id ? row.addresseeId : row.requesterId;
      const other = await storage.getUserById(otherId);
      if (!other) continue;

      if (row.status === "accepted") {
        const counts = countRosterVariants(await storage.getEntries(other.id, SEASON_ID));
        friends.push({
          username: other.username,
          collected: counts.collected,
          mastered: counts.mastered,
          showcase: await storage.getShowcase(other.id, SEASON_ID),
          since: row.respondedAt ?? row.createdAt,
        });
      } else if (row.addresseeId === me.id) {
        incoming.push({ username: other.username, sentAt: row.createdAt });
      } else {
        outgoing.push({ username: other.username, sentAt: row.createdAt });
      }
    }

    friends.sort((a, b) => b.mastered - a.mastered || a.username.localeCompare(b.username));
    incoming.sort((a, b) => b.sentAt - a.sentAt);
    outgoing.sort((a, b) => b.sentAt - a.sentAt);

    res.json({ seasonId: SEASON_ID, friends, incoming, outgoing });
  });

  /** Type-ahead for the add-friend box, annotated with the current relationship. */
  app.get("/api/friends/search", requireAuth, async (req: AuthedRequest, res) => {
    const me = req.user!;
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ results: [] });

    const found = await storage.searchUsers(q, me.id);
    const results = [];
    for (const user of found) {
      const rel = await storage.getRelationship(me.id, user.id);
      const relation = !rel
        ? "none"
        : rel.status === "accepted"
          ? "friends"
          : rel.requesterId === me.id
            ? "outgoing"
            : "incoming";
      results.push({ username: user.username, relation });
    }
    res.json({ results });
  });

  app.post("/api/friends/requests", requireAuth, async (req: AuthedRequest, res) => {
    const me = req.user!;
    const parsed = friendRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    const target = await storage.getUserByUsername(parsed.data.username);
    if (!target) return res.status(404).json({ message: "No pod found with that username" });
    if (target.id === me.id) {
      return res.status(400).json({ message: "You are already your own best friend" });
    }
    try {
      const status = await storage.createRequest(me.id, target.id);
      res.json({ username: target.username, status });
    } catch (err) {
      res.status(429).json({
        message: err instanceof Error ? err.message : "Could not send that request",
      });
    }
  });

  app.post("/api/friends/requests/:username/accept", requireAuth, async (req: AuthedRequest, res) => {
    const me = req.user!;
    const parsed = usernameSchema.safeParse(req.params.username);
    if (!parsed.success) return res.status(400).json({ message: "Bad username" });
    const other = await storage.getUserByUsername(parsed.data);
    if (!other) return res.status(404).json({ message: "That pod no longer exists" });
    const ok = await storage.acceptRequest(me.id, other.id);
    if (!ok) return res.status(404).json({ message: "No pending request from that player" });
    res.json({ username: other.username, status: "accepted" });
  });

  /** Decline, cancel an outgoing invite, or unfriend — same effect either way. */
  app.delete("/api/friends/:username", requireAuth, async (req: AuthedRequest, res) => {
    const me = req.user!;
    const parsed = usernameSchema.safeParse(req.params.username);
    if (!parsed.success) return res.status(400).json({ message: "Bad username" });
    const other = await storage.getUserByUsername(parsed.data);
    if (!other) return res.status(404).json({ message: "That pod no longer exists" });
    const removed = await storage.removeRelationship(me.id, other.id);
    if (!removed) return res.status(404).json({ message: "You are not connected to that player" });
    res.json({ ok: true });
  });

  /**
   * A friend's full board for the current season. Guarded on an accepted
   * friendship, so a username alone reveals nothing.
   */
  app.get("/api/friends/:username/pod", requireAuth, async (req: AuthedRequest, res) => {
    const me = req.user!;
    const parsed = usernameSchema.safeParse(req.params.username);
    if (!parsed.success) return res.status(400).json({ message: "Bad username" });
    const other = await storage.getUserByUsername(parsed.data);
    if (!other) return res.status(404).json({ message: "That pod no longer exists" });

    const rel = await storage.getRelationship(me.id, other.id);
    if (!rel || rel.status !== "accepted") {
      return res.status(403).json({ message: "You can only view a friend's pod" });
    }

    const entries = await storage.getEntries(other.id, SEASON_ID);
    res.json({
      username: other.username,
      seasonId: SEASON_ID,
      since: rel.respondedAt ?? rel.createdAt,
      showcase: await storage.getShowcase(other.id, SEASON_ID),
      entries: entries
        .filter((e) => ROSTER_VARIANTS.has(`${e.spriteId}:${e.finishId}`))
        .map((e) => ({
          spriteId: e.spriteId,
          finishId: e.finishId,
          status: e.status,
          level: e.level,
        })),
    });
  });

  return httpServer;
}
