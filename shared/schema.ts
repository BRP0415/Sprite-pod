import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  salt: text("salt").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const entries = sqliteTable(
  "entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    seasonId: text("season_id").notNull(),
    spriteId: text("sprite_id").notNull(),
    finishId: text("finish_id").notNull(),
    status: text("status").notNull(),
    level: integer("level").notNull().default(1),
  },
  (t) => ({
    uniq: uniqueIndex("entries_unique").on(t.userId, t.seasonId, t.spriteId, t.finishId),
  }),
);

/**
 * One row per pair of people, whichever direction the request went.
 * `status` is "pending" until the addressee accepts, then "accepted".
 * Declining or unfriending deletes the row, so a later request can be sent.
 */
export const friendships = sqliteTable(
  "friendships",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requesterId: integer("requester_id").notNull(),
    addresseeId: integer("addressee_id").notNull(),
    status: text("status").notNull(),
    createdAt: integer("created_at").notNull(),
    respondedAt: integer("responded_at"),
  },
  (t) => ({
    uniq: uniqueIndex("friendships_pair").on(t.requesterId, t.addresseeId),
  }),
);

/** Up to SHOWCASE_MAX pinned variants shown at the top of a profile. */
export const showcase = sqliteTable(
  "showcase",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    seasonId: text("season_id").notNull(),
    spriteId: text("sprite_id").notNull(),
    finishId: text("finish_id").notNull(),
    slot: integer("slot").notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("showcase_slot").on(t.userId, t.seasonId, t.slot),
  }),
);

export const SHOWCASE_MAX = 4;

export type User = typeof users.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type ShowcaseRow = typeof showcase.$inferSelect;

export const statusSchema = z.enum(["none", "collected", "mastered"]);
export type EntryStatus = z.infer<typeof statusSchema>;

export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be 20 characters or fewer")
    .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only"),
  pin: z
    .string()
    .regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const progressItemSchema = z.object({
  spriteId: z.string().min(1),
  finishId: z.string().min(1),
  status: statusSchema,
  level: z.number().int().min(1).max(5).default(1),
});
export type ProgressItem = z.infer<typeof progressItemSchema>;

export const bulkProgressSchema = z.object({
  entries: z.array(progressItemSchema).max(500),
});

/** Usernames are the only handle in the app, so reuse the sign-up rules. */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be 20 characters or fewer")
  .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only");

export const friendRequestSchema = z.object({ username: usernameSchema });

export const showcaseSchema = z.object({
  items: z
    .array(z.object({ spriteId: z.string().min(1), finishId: z.string().min(1) }))
    .max(SHOWCASE_MAX),
});
export type ShowcaseItem = z.infer<typeof showcaseSchema>["items"][number];
