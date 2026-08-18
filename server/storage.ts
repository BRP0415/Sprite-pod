import { users, sessions, entries, friendships, showcase, SHOWCASE_MAX } from "@shared/schema";
import type { User, Entry, ProgressItem, ShowcaseItem } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, or, like, ne, sql } from "drizzle-orm";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Point DATABASE_PATH at a persistent volume in production. Hosts with
// ephemeral disks wipe the default file on every redeploy, taking accounts
// and progress with it.
const dbPath = process.env.DATABASE_PATH || "data.db";
try {
  mkdirSync(dirname(dbPath), { recursive: true });
} catch {
  /* already exists, or cwd-relative path with no directory part */
}
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    season_id TEXT NOT NULL,
    sprite_id TEXT NOT NULL,
    finish_id TEXT NOT NULL,
    status TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1
  );
  CREATE UNIQUE INDEX IF NOT EXISTS entries_unique
    ON entries (user_id, season_id, sprite_id, finish_id);
  CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL,
    addressee_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    responded_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair
    ON friendships (requester_id, addressee_id);
  CREATE INDEX IF NOT EXISTS friendships_addressee ON friendships (addressee_id, status);
  CREATE TABLE IF NOT EXISTS showcase (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    season_id TEXT NOT NULL,
    sprite_id TEXT NOT NULL,
    finish_id TEXT NOT NULL,
    slot INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS showcase_slot
    ON showcase (user_id, season_id, slot);
`);

export const db = drizzle(sqlite);

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 64).toString("hex");
}

export interface IStorage {
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(username: string, pin: string): Promise<User>;
  verifyPin(user: User, pin: string): boolean;
  createSession(userId: number): Promise<string>;
  getUserByToken(token: string): Promise<User | undefined>;
  deleteSession(token: string): Promise<void>;
  getEntries(userId: number, seasonId: string): Promise<Entry[]>;
  upsertEntry(userId: number, seasonId: string, item: ProgressItem): Promise<void>;
  resetSeason(userId: number, seasonId: string): Promise<void>;
  searchUsers(query: string, excludeUserId: number, limit?: number): Promise<User[]>;
  getUserById(id: number): Promise<User | undefined>;
  getRelationship(a: number, b: number): Promise<Friendship | undefined>;
  listFriendships(userId: number): Promise<Friendship[]>;
  createRequest(requesterId: number, addresseeId: number): Promise<"pending" | "accepted">;
  acceptRequest(addresseeId: number, requesterId: number): Promise<boolean>;
  removeRelationship(a: number, b: number): Promise<boolean>;
  countPendingOutgoing(userId: number): Promise<number>;
  getShowcase(userId: number, seasonId: string): Promise<ShowcaseItem[]>;
  setShowcase(userId: number, seasonId: string, items: ShowcaseItem[]): Promise<void>;
}

type Friendship = typeof friendships.$inferSelect;

/** One outgoing invite spammer should not be able to fill the table. */
const MAX_PENDING_OUTGOING = 50;

export class DatabaseStorage implements IStorage {
  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username.toLowerCase())).get();
  }

  async createUser(username: string, pin: string): Promise<User> {
    const salt = randomBytes(16).toString("hex");
    return db
      .insert(users)
      .values({
        username: username.toLowerCase(),
        salt,
        pinHash: hashPin(pin, salt),
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  verifyPin(user: User, pin: string): boolean {
    const candidate = Buffer.from(hashPin(pin, user.salt), "hex");
    const known = Buffer.from(user.pinHash, "hex");
    if (candidate.length !== known.length) return false;
    return timingSafeEqual(candidate, known);
  }

  async createSession(userId: number): Promise<string> {
    const token = randomBytes(32).toString("hex");
    db.insert(sessions).values({ token, userId, createdAt: Date.now() }).run();
    return token;
  }

  async getUserByToken(token: string): Promise<User | undefined> {
    const session = db.select().from(sessions).where(eq(sessions.token, token)).get();
    if (!session) return undefined;
    return db.select().from(users).where(eq(users.id, session.userId)).get();
  }

  async deleteSession(token: string): Promise<void> {
    db.delete(sessions).where(eq(sessions.token, token)).run();
  }

  async getEntries(userId: number, seasonId: string): Promise<Entry[]> {
    return db
      .select()
      .from(entries)
      .where(and(eq(entries.userId, userId), eq(entries.seasonId, seasonId)))
      .all();
  }

  async upsertEntry(userId: number, seasonId: string, item: ProgressItem): Promise<void> {
    const where = and(
      eq(entries.userId, userId),
      eq(entries.seasonId, seasonId),
      eq(entries.spriteId, item.spriteId),
      eq(entries.finishId, item.finishId),
    );
    if (item.status === "none") {
      db.delete(entries).where(where).run();
      return;
    }
    const existing = db.select().from(entries).where(where).get();
    if (existing) {
      db.update(entries)
        .set({ status: item.status, level: item.status === "mastered" ? 5 : item.level })
        .where(eq(entries.id, existing.id))
        .run();
    } else {
      db.insert(entries)
        .values({
          userId,
          seasonId,
          spriteId: item.spriteId,
          finishId: item.finishId,
          status: item.status,
          level: item.status === "mastered" ? 5 : item.level,
        })
        .run();
    }
  }

  async resetSeason(userId: number, seasonId: string): Promise<void> {
    db.delete(entries)
      .where(and(eq(entries.userId, userId), eq(entries.seasonId, seasonId)))
      .run();
    // The showcase points at variants you own, so it cannot outlive a reset.
    db.delete(showcase)
      .where(and(eq(showcase.userId, userId), eq(showcase.seasonId, seasonId)))
      .run();
  }

  // ---- people ----------------------------------------------------------

  async getUserById(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  /** Prefix match so you can find someone you half-remember. */
  async searchUsers(query: string, excludeUserId: number, limit = 8): Promise<User[]> {
    const q = query.toLowerCase().replace(/[%_]/g, "");
    if (!q) return [];
    return db
      .select()
      .from(users)
      .where(and(like(users.username, `${q}%`), ne(users.id, excludeUserId)))
      .limit(limit)
      .all();
  }

  // ---- friendships -----------------------------------------------------

  async getRelationship(a: number, b: number): Promise<Friendship | undefined> {
    return db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
          and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
        ),
      )
      .get();
  }

  async listFriendships(userId: number): Promise<Friendship[]> {
    return db
      .select()
      .from(friendships)
      .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))
      .all();
  }

  async countPendingOutgoing(userId: number): Promise<number> {
    const row = db
      .select({ n: sql<number>`count(*)` })
      .from(friendships)
      .where(and(eq(friendships.requesterId, userId), eq(friendships.status, "pending")))
      .get();
    return row?.n ?? 0;
  }

  /**
   * Send a request. If the other person already has one out to you, this is
   * plainly a mutual yes, so it is accepted immediately rather than leaving
   * two invitations dangling in opposite directions.
   */
  async createRequest(requesterId: number, addresseeId: number): Promise<"pending" | "accepted"> {
    const existing = await this.getRelationship(requesterId, addresseeId);
    if (existing) {
      if (existing.status === "accepted") return "accepted";
      if (existing.addresseeId === requesterId) {
        db.update(friendships)
          .set({ status: "accepted", respondedAt: Date.now() })
          .where(eq(friendships.id, existing.id))
          .run();
        return "accepted";
      }
      return "pending";
    }
    if ((await this.countPendingOutgoing(requesterId)) >= MAX_PENDING_OUTGOING) {
      throw new Error("Too many pending requests — wait for some to be answered");
    }
    db.insert(friendships)
      .values({ requesterId, addresseeId, status: "pending", createdAt: Date.now() })
      .run();
    return "pending";
  }

  async acceptRequest(addresseeId: number, requesterId: number): Promise<boolean> {
    const row = db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.requesterId, requesterId),
          eq(friendships.addresseeId, addresseeId),
          eq(friendships.status, "pending"),
        ),
      )
      .get();
    if (!row) return false;
    db.update(friendships)
      .set({ status: "accepted", respondedAt: Date.now() })
      .where(eq(friendships.id, row.id))
      .run();
    return true;
  }

  /** Covers decline, cancel and unfriend — they all just drop the row. */
  async removeRelationship(a: number, b: number): Promise<boolean> {
    const existing = await this.getRelationship(a, b);
    if (!existing) return false;
    db.delete(friendships).where(eq(friendships.id, existing.id)).run();
    return true;
  }

  // ---- showcase --------------------------------------------------------

  async getShowcase(userId: number, seasonId: string): Promise<ShowcaseItem[]> {
    return db
      .select({ spriteId: showcase.spriteId, finishId: showcase.finishId })
      .from(showcase)
      .where(and(eq(showcase.userId, userId), eq(showcase.seasonId, seasonId)))
      .orderBy(showcase.slot)
      .all();
  }

  /**
   * Replaces the whole showcase. Only variants the player actually holds are
   * kept, so a showcase can never advertise something they have not collected.
   */
  async setShowcase(userId: number, seasonId: string, items: ShowcaseItem[]): Promise<void> {
    const owned = new Set(
      (await this.getEntries(userId, seasonId)).map((e) => `${e.spriteId}:${e.finishId}`),
    );
    const seen = new Set<string>();
    const clean = items
      .filter((i) => {
        const key = `${i.spriteId}:${i.finishId}`;
        if (!owned.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, SHOWCASE_MAX);

    db.transaction((tx) => {
      tx.delete(showcase)
        .where(and(eq(showcase.userId, userId), eq(showcase.seasonId, seasonId)))
        .run();
      clean.forEach((item, slot) => {
        tx.insert(showcase)
          .values({ userId, seasonId, spriteId: item.spriteId, finishId: item.finishId, slot })
          .run();
      });
    });
  }
}

export const storage = new DatabaseStorage();
