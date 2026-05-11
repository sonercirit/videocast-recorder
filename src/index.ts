import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { z } from "zod";
import * as schema from "./db/schema";
import { RoomSignaling } from "./room-signaling";
import { homePage, roomPage } from "./views";

export { RoomSignaling };

type Env = {
  DB: D1Database;
  RECORDINGS: R2Bucket;
  ROOM_SIGNALING: DurableObjectNamespace;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  APP_ORIGIN?: string;
};

const createDb = (env: Env) => drizzle(env.DB, { schema });
type Database = ReturnType<typeof createDb>;

const createAuth = (env: Env, db: Database) => {
  const trustedOrigins = [env.APP_ORIGIN, env.BETTER_AUTH_URL].filter(Boolean) as string[];

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: trustedOrigins.length ? trustedOrigins : undefined,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
  });
};

type Auth = ReturnType<typeof createAuth>;
type AppBindings = { Bindings: Env; Variables: { db: Database; auth: Auth } };
type AppContext = Context<AppBindings>;

const app = new Hono<AppBindings>();

const qualitySchema = z.enum(["low", "medium", "high"]);
const recordingQualities = {
  low: {
    id: "low",
    label: "Low",
    width: 640,
    height: 360,
    frameRate: 24,
    videoBitsPerSecond: 750_000,
    audioBitsPerSecond: 64_000,
  },
  medium: {
    id: "medium",
    label: "Medium",
    width: 1280,
    height: 720,
    frameRate: 30,
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 96_000,
  },
  high: {
    id: "high",
    label: "High",
    width: 1920,
    height: 1080,
    frameRate: 30,
    videoBitsPerSecond: 5_000_000,
    audioBitsPerSecond: 128_000,
  },
} as const;

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const joinRoomSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
});

const startRecordingSchema = z.object({
  quality: qualitySchema,
  mimeType: z.string().trim().min(1).max(120),
});

const completeRecordingSchema = z.object({
  chunkCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});

app.use("*", async (c, next) => {
  const db = createDb(c.env);
  c.set("db", db);
  c.set("auth", createAuth(c.env, db));
  await next();
});

app.on(["GET", "POST"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

app.get("/", (c) => c.html(homePage()));
app.get("/rooms/:roomId", (c) => c.html(roomPage(c.req.param("roomId"))));
app.get("/health", (c) => c.json({ ok: true }));

app.get("/api/recording-qualities", (c) => c.json({ qualities: recordingQualities }));

app.get("/api/me", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ user: auth.user });
});

app.get("/api/rooms", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const rooms = await c
    .get("db")
    .select()
    .from(schema.rooms)
    .where(eq(schema.rooms.isOpen, true))
    .orderBy(desc(schema.rooms.createdAt))
    .limit(50);

  return c.json({ rooms });
});

app.post("/api/rooms", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const input = await parseJson(c, createRoomSchema);
  if (!input.success) return c.json({ error: input.error }, 400);

  const now = new Date();
  const room = {
    id: newId("room"),
    name: input.data.name,
    slug: `${slugify(input.data.name)}-${crypto.randomUUID().slice(0, 8)}`,
    ownerUserId: auth.user.id,
    isOpen: true,
    createdAt: now,
    updatedAt: now,
  };

  await c.get("db").insert(schema.rooms).values(room);
  return c.json({ room }, 201);
});

app.get("/api/rooms/:roomId", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const room = await getRoom(c.get("db"), c.req.param("roomId"));
  if (!room) return c.json({ error: "Room not found" }, 404);
  if (!room.isOpen && room.ownerUserId !== auth.user.id) {
    return c.json({ error: "Room is closed" }, 403);
  }

  return c.json({ room });
});

app.post("/api/rooms/:roomId/join", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const roomId = c.req.param("roomId");
  const room = await getRoom(c.get("db"), roomId);
  if (!room) return c.json({ error: "Room not found" }, 404);
  if (!room.isOpen) return c.json({ error: "Room is closed" }, 403);

  const input = await parseJson(c, joinRoomSchema, {});
  const displayName =
    input.success && input.data.displayName
      ? input.data.displayName
      : auth.user.name || auth.user.email || "Guest";

  const participant = {
    id: newId("part"),
    roomId,
    userId: auth.user.id,
    displayName,
    joinedAt: new Date(),
    leftAt: null,
  };

  await c.get("db").insert(schema.roomParticipants).values(participant);
  return c.json({ participant }, 201);
});

app.post("/api/rooms/:roomId/participants/:participantId/leave", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  await c
    .get("db")
    .update(schema.roomParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(schema.roomParticipants.id, c.req.param("participantId")),
        eq(schema.roomParticipants.roomId, c.req.param("roomId")),
        eq(schema.roomParticipants.userId, auth.user.id),
      ),
    );

  return c.json({ ok: true });
});

app.get("/api/rooms/:roomId/signaling", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  if (c.req.header("Upgrade") !== "websocket") {
    return c.text("Expected WebSocket upgrade", 426);
  }

  const roomId = c.req.param("roomId");
  const participantId = c.req.query("participantId");
  if (!participantId) return c.json({ error: "Missing participantId" }, 400);

  const [participant] = await c
    .get("db")
    .select()
    .from(schema.roomParticipants)
    .where(
      and(
        eq(schema.roomParticipants.id, participantId),
        eq(schema.roomParticipants.roomId, roomId),
        eq(schema.roomParticipants.userId, auth.user.id),
      ),
    )
    .limit(1);

  if (!participant) return c.json({ error: "Participant not found" }, 403);

  const objectId = c.env.ROOM_SIGNALING.idFromName(roomId);
  const stub = c.env.ROOM_SIGNALING.get(objectId);
  const upstream = new Request(c.req.raw);
  upstream.headers.set("x-user-id", auth.user.id);
  upstream.headers.set("x-user-name", participant.displayName);
  upstream.headers.set("x-participant-id", participant.id);

  return stub.fetch(upstream);
});

app.post("/api/rooms/:roomId/recordings/start", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const roomId = c.req.param("roomId");
  const room = await getRoom(c.get("db"), roomId);
  if (!room) return c.json({ error: "Room not found" }, 404);
  if (!room.isOpen) return c.json({ error: "Room is closed" }, 403);

  const input = await parseJson(c, startRecordingSchema);
  if (!input.success) return c.json({ error: input.error }, 400);

  const now = new Date();
  const recordingId = newId("rec");
  const recording = {
    id: recordingId,
    roomId,
    userId: auth.user.id,
    quality: input.data.quality,
    mimeType: input.data.mimeType,
    status: "recording" as const,
    r2Prefix: `rooms/${roomId}/recordings/${recordingId}`,
    chunkCount: 0,
    durationMs: 0,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await c.get("db").insert(schema.recordings).values(recording);
  return c.json({ recording }, 201);
});

app.put("/api/rooms/:roomId/recordings/:recordingId/chunks/:chunkIndex", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const chunkIndex = Number.parseInt(c.req.param("chunkIndex"), 10);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return c.json({ error: "Invalid chunk index" }, 400);
  }

  const recording = await getRecording(c.get("db"), c.req.param("recordingId"), c.req.param("roomId"));
  if (!recording) return c.json({ error: "Recording not found" }, 404);
  if (recording.userId !== auth.user.id) return c.json({ error: "Forbidden" }, 403);
  if (recording.status !== "recording") return c.json({ error: "Recording is not accepting chunks" }, 409);
  if (!c.req.raw.body) return c.json({ error: "Missing chunk body" }, 400);

  const extension = extensionForMime(recording.mimeType);
  const r2Key = `${recording.r2Prefix}/chunks/${String(chunkIndex).padStart(6, "0")}.${extension}`;
  const byteLengthHeader = c.req.header("x-byte-length") ?? c.req.header("content-length") ?? "0";
  const byteLength = Number.isFinite(Number(byteLengthHeader)) ? Number(byteLengthHeader) : 0;

  await c.env.RECORDINGS.put(r2Key, c.req.raw.body, {
    httpMetadata: { contentType: c.req.header("content-type") ?? recording.mimeType },
    customMetadata: {
      roomId: recording.roomId,
      recordingId: recording.id,
      userId: auth.user.id,
      chunkIndex: String(chunkIndex),
      quality: recording.quality,
    },
  });

  const uploadedAt = new Date();
  const chunk = {
    id: newId("chunk"),
    recordingId: recording.id,
    chunkIndex,
    r2Key,
    byteLength,
    uploadedAt,
  };

  await c
    .get("db")
    .insert(schema.recordingChunks)
    .values(chunk)
    .onConflictDoUpdate({
      target: [schema.recordingChunks.recordingId, schema.recordingChunks.chunkIndex],
      set: { r2Key, byteLength, uploadedAt },
    });

  if (chunkIndex + 1 > recording.chunkCount) {
    await c
      .get("db")
      .update(schema.recordings)
      .set({ chunkCount: chunkIndex + 1, updatedAt: uploadedAt })
      .where(eq(schema.recordings.id, recording.id));
  }

  return c.json({ chunk: { index: chunkIndex, r2Key, byteLength } });
});

app.post("/api/rooms/:roomId/recordings/:recordingId/complete", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const recording = await getRecording(c.get("db"), c.req.param("recordingId"), c.req.param("roomId"));
  if (!recording) return c.json({ error: "Recording not found" }, 404);
  if (recording.userId !== auth.user.id) return c.json({ error: "Forbidden" }, 403);

  const input = await parseJson(c, completeRecordingSchema);
  if (!input.success) return c.json({ error: input.error }, 400);

  const chunks = await c
    .get("db")
    .select()
    .from(schema.recordingChunks)
    .where(eq(schema.recordingChunks.recordingId, recording.id))
    .orderBy(asc(schema.recordingChunks.chunkIndex));

  const now = new Date();
  const chunkCount = chunks.length || input.data.chunkCount;
  await c.env.RECORDINGS.put(
    `${recording.r2Prefix}/manifest.json`,
    JSON.stringify(
      {
        recordingId: recording.id,
        roomId: recording.roomId,
        userId: recording.userId,
        quality: recording.quality,
        mimeType: recording.mimeType,
        durationMs: input.data.durationMs,
        chunkCount,
        chunks: chunks.map((chunk) => ({
          index: chunk.chunkIndex,
          r2Key: chunk.r2Key,
          byteLength: chunk.byteLength,
        })),
        completedAt: now.toISOString(),
      },
      null,
      2,
    ),
    { httpMetadata: { contentType: "application/json" } },
  );

  await c
    .get("db")
    .update(schema.recordings)
    .set({
      status: "completed",
      chunkCount,
      durationMs: input.data.durationMs,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.recordings.id, recording.id));

  return c.json({ ok: true, manifestKey: `${recording.r2Prefix}/manifest.json` });
});

app.get("/api/rooms/:roomId/recordings", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const roomId = c.req.param("roomId");
  const room = await getRoom(c.get("db"), roomId);
  if (!room) return c.json({ error: "Room not found" }, 404);

  const where =
    room.ownerUserId === auth.user.id
      ? eq(schema.recordings.roomId, roomId)
      : and(eq(schema.recordings.roomId, roomId), eq(schema.recordings.userId, auth.user.id));

  const recordings = await c
    .get("db")
    .select()
    .from(schema.recordings)
    .where(where)
    .orderBy(desc(schema.recordings.createdAt))
    .limit(100);

  return c.json({ recordings });
});

app.get("/api/recordings/:recordingId/chunks/:chunkIndex", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const chunkIndex = Number.parseInt(c.req.param("chunkIndex"), 10);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return c.json({ error: "Invalid chunk index" }, 400);
  }

  const recording = await getRecording(c.get("db"), c.req.param("recordingId"));
  if (!recording) return c.json({ error: "Recording not found" }, 404);

  const room = await getRoom(c.get("db"), recording.roomId);
  if (!room) return c.json({ error: "Room not found" }, 404);
  if (recording.userId !== auth.user.id && room.ownerUserId !== auth.user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [chunk] = await c
    .get("db")
    .select()
    .from(schema.recordingChunks)
    .where(
      and(
        eq(schema.recordingChunks.recordingId, recording.id),
        eq(schema.recordingChunks.chunkIndex, chunkIndex),
      ),
    )
    .limit(1);

  if (!chunk) return c.json({ error: "Chunk not found" }, 404);

  const object = await c.env.RECORDINGS.get(chunk.r2Key);
  if (!object) return c.json({ error: "Object not found" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=60");
  return new Response(object.body, { headers });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

async function getSession(c: AppContext): Promise<{ user: any; session: any } | null> {
  return c.get("auth").api.getSession({ headers: c.req.raw.headers }) as Promise<{
    user: any;
    session: any;
  } | null>;
}

async function parseJson<T extends z.ZodTypeAny>(
  c: AppContext,
  parser: T,
  fallback?: unknown,
): Promise<{ success: true; data: z.infer<T> } | { success: false; error: string }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    if (fallback === undefined) return { success: false, error: "Expected JSON body" };
    body = fallback;
  }

  const parsed = parser.safeParse(body);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((issue) => issue.message).join(", ") };
  }
  return { success: true, data: parsed.data };
}

async function getRoom(db: Database, roomId: string) {
  const [room] = await db.select().from(schema.rooms).where(eq(schema.rooms.id, roomId)).limit(1);
  return room ?? null;
}

async function getRecording(db: Database, recordingId: string, roomId?: string) {
  const where = roomId
    ? and(eq(schema.recordings.id, recordingId), eq(schema.recordings.roomId, roomId))
    : eq(schema.recordings.id, recordingId);
  const [recording] = await db.select().from(schema.recordings).where(where).limit(1);
  return recording ?? null;
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "room"
  );
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogv";
  return "webm";
}

export default app;
