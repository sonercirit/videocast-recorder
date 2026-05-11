import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
    image: text("image"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex("user_email_unique").on(table.email),
  }),
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    token: text("token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    tokenIdx: uniqueIndex("session_token_unique").on(table.token),
    userIdx: index("session_user_id_idx").on(table.userId),
  }),
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    userIdx: index("account_user_id_idx").on(table.userId),
  }),
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (table) => ({
    identifierIdx: index("verification_identifier_idx").on(table.identifier),
  }),
);

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    isOpen: integer("is_open", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("rooms_slug_unique").on(table.slug),
    ownerIdx: index("rooms_owner_user_id_idx").on(table.ownerUserId),
    createdAtIdx: index("rooms_created_at_idx").on(table.createdAt),
  }),
);

export const roomParticipants = sqliteTable(
  "room_participants",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
    leftAt: integer("left_at", { mode: "timestamp" }),
  },
  (table) => ({
    roomIdx: index("room_participants_room_id_idx").on(table.roomId),
    userIdx: index("room_participants_user_id_idx").on(table.userId),
  }),
);

export const recordings = sqliteTable(
  "recordings",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    quality: text("quality", { enum: ["low", "medium", "high"] }).notNull(),
    mimeType: text("mime_type").notNull(),
    status: text("status", {
      enum: ["recording", "completed", "failed"],
    })
      .notNull()
      .default("recording"),
    r2Prefix: text("r2_prefix").notNull(),
    chunkCount: integer("chunk_count").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    roomIdx: index("recordings_room_id_idx").on(table.roomId),
    userIdx: index("recordings_user_id_idx").on(table.userId),
    statusIdx: index("recordings_status_idx").on(table.status),
  }),
);

export const recordingChunks = sqliteTable(
  "recording_chunks",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    r2Key: text("r2_key").notNull(),
    byteLength: integer("byte_length").notNull(),
    uploadedAt: integer("uploaded_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    recordingChunkIdx: uniqueIndex("recording_chunks_recording_index_unique").on(
      table.recordingId,
      table.chunkIndex,
    ),
    recordingIdx: index("recording_chunks_recording_id_idx").on(
      table.recordingId,
    ),
  }),
);

export const roomRelations = relations(rooms, ({ one, many }) => ({
  owner: one(user, {
    fields: [rooms.ownerUserId],
    references: [user.id],
  }),
  participants: many(roomParticipants),
  recordings: many(recordings),
}));

export const recordingRelations = relations(recordings, ({ one, many }) => ({
  room: one(rooms, {
    fields: [recordings.roomId],
    references: [rooms.id],
  }),
  creator: one(user, {
    fields: [recordings.userId],
    references: [user.id],
  }),
  chunks: many(recordingChunks),
}));

export const recordingChunkRelations = relations(recordingChunks, ({ one }) => ({
  recording: one(recordings, {
    fields: [recordingChunks.recordingId],
    references: [recordings.id],
  }),
}));

export const roomParticipantRelations = relations(roomParticipants, ({ one }) => ({
  room: one(rooms, {
    fields: [roomParticipants.roomId],
    references: [rooms.id],
  }),
  user: one(user, {
    fields: [roomParticipants.userId],
    references: [user.id],
  }),
}));

export const nowSql = sql`(unixepoch())`;
