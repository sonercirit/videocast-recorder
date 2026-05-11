PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" integer NOT NULL,
  "image" text,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email");

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" integer NOT NULL,
  "token" text NOT NULL,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_unique" ON "session" ("token");
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" ("user_id");

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" integer,
  "refresh_token_expires_at" integer,
  "scope" text,
  "password" text,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" ("user_id");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" integer NOT NULL,
  "created_at" integer,
  "updated_at" integer
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

CREATE TABLE IF NOT EXISTS "rooms" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "owner_user_id" text NOT NULL,
  "is_open" integer DEFAULT 1 NOT NULL,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL,
  FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_slug_unique" ON "rooms" ("slug");
CREATE INDEX IF NOT EXISTS "rooms_owner_user_id_idx" ON "rooms" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "rooms_created_at_idx" ON "rooms" ("created_at");

CREATE TABLE IF NOT EXISTS "room_participants" (
  "id" text PRIMARY KEY NOT NULL,
  "room_id" text NOT NULL,
  "user_id" text NOT NULL,
  "display_name" text NOT NULL,
  "joined_at" integer NOT NULL,
  "left_at" integer,
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "room_participants_room_id_idx" ON "room_participants" ("room_id");
CREATE INDEX IF NOT EXISTS "room_participants_user_id_idx" ON "room_participants" ("user_id");

CREATE TABLE IF NOT EXISTS "recordings" (
  "id" text PRIMARY KEY NOT NULL,
  "room_id" text NOT NULL,
  "user_id" text NOT NULL,
  "quality" text NOT NULL,
  "mime_type" text NOT NULL,
  "status" text DEFAULT 'recording' NOT NULL,
  "r2_prefix" text NOT NULL,
  "chunk_count" integer DEFAULT 0 NOT NULL,
  "duration_ms" integer DEFAULT 0 NOT NULL,
  "started_at" integer NOT NULL,
  "completed_at" integer,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL,
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "recordings_room_id_idx" ON "recordings" ("room_id");
CREATE INDEX IF NOT EXISTS "recordings_user_id_idx" ON "recordings" ("user_id");
CREATE INDEX IF NOT EXISTS "recordings_status_idx" ON "recordings" ("status");

CREATE TABLE IF NOT EXISTS "recording_chunks" (
  "id" text PRIMARY KEY NOT NULL,
  "recording_id" text NOT NULL,
  "chunk_index" integer NOT NULL,
  "r2_key" text NOT NULL,
  "byte_length" integer NOT NULL,
  "uploaded_at" integer NOT NULL,
  FOREIGN KEY ("recording_id") REFERENCES "recordings"("id") ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "recording_chunks_recording_index_unique" ON "recording_chunks" ("recording_id", "chunk_index");
CREATE INDEX IF NOT EXISTS "recording_chunks_recording_id_idx" ON "recording_chunks" ("recording_id");
