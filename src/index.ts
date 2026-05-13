import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { createAuthFromEnv } from "./auth";
import * as authSchema from "./db/auth-schema.gen";
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

const createRuntimeAuth = (env: Env, db: Database) =>
  createAuthFromEnv(env, db, authSchema);

type Auth = ReturnType<typeof createRuntimeAuth>;
type AppBindings = { Bindings: Env; Variables: { db: Database; auth: Auth } };
type AppContext = Context<AppBindings>;

const app = new Hono<AppBindings>();

const qualitySchema = z.enum(["low", "medium", "high", "2k", "ultra"]);
const frameRateSchema = z.union([z.literal(24), z.literal(30), z.literal(60)]);
const recordingQualities = {
  low: {
    id: "low",
    label: "Low",
    width: 640,
    height: 360,
    videoBitsPerSecond: 750_000,
    audioBitsPerSecond: 64_000,
  },
  medium: {
    id: "medium",
    label: "Medium",
    width: 1280,
    height: 720,
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 96_000,
  },
  high: {
    id: "high",
    label: "High",
    width: 1920,
    height: 1080,
    videoBitsPerSecond: 5_000_000,
    audioBitsPerSecond: 128_000,
  },
  "2k": {
    id: "2k",
    label: "2K",
    width: 2560,
    height: 1440,
    videoBitsPerSecond: 10_000_000,
    audioBitsPerSecond: 160_000,
  },
  ultra: {
    id: "ultra",
    label: "Ultra 4K",
    width: 3840,
    height: 2160,
    videoBitsPerSecond: 17_500_000,
    audioBitsPerSecond: 192_000,
  },
} as const;
const recordingFrameRates = [
  { id: "24", label: "24 FPS", frameRate: 24 },
  { id: "30", label: "30 FPS", frameRate: 30 },
  { id: "60", label: "60 FPS", frameRate: 60 },
] as const;

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const joinRoomSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
});

const startRecordingSchema = z.object({
  quality: qualitySchema,
  frameRate: frameRateSchema.default(30),
  mimeType: z.string().trim().min(1).max(120),
  recordingSessionId: z.string().trim().min(1).max(120).optional(),
  syncStartedAt: z.number().int().positive().optional(),
});

const completeRecordingSchema = z.object({
  chunkCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  syncStoppedAt: z.number().int().positive().optional(),
});

app.use("*", async (c, next) => {
  const db = createDb(c.env);
  c.set("db", db);
  c.set("auth", createRuntimeAuth(c.env, db));
  await next();
});

app.on(["GET", "POST"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

app.get("/", (c) => c.html(homePage()));
app.get("/rooms/:roomId", (c) => c.html(roomPage(c.req.param("roomId"))));
app.get("/health", (c) => c.json({ ok: true }));

app.get("/api/recording-qualities", (c) =>
  c.json({ qualities: recordingQualities, frameRates: recordingFrameRates }),
);

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

  const room = await getRoom(c.get("db"), roomId);
  if (!room) return c.json({ error: "Room not found" }, 404);
  if (!room.isOpen && room.ownerUserId !== auth.user.id) {
    return c.json({ error: "Room is closed" }, 403);
  }

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
  upstream.headers.set("x-is-host", String(room.ownerUserId === auth.user.id));

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
  const recordingSessionId = input.data.recordingSessionId ?? recordingId;
  const syncStartedAt = input.data.syncStartedAt
    ? new Date(input.data.syncStartedAt)
    : now;
  const recording = {
    id: recordingId,
    roomId,
    userId: auth.user.id,
    quality: input.data.quality,
    frameRate: input.data.frameRate,
    mimeType: input.data.mimeType,
    recordingSessionId,
    syncStartedAt,
    syncStoppedAt: null,
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

app.put(
  "/api/rooms/:roomId/recordings/:recordingId/chunks/:chunkIndex",
  async (c) => {
    const auth = await getSession(c);
    if (!auth) return c.json({ error: "Unauthorized" }, 401);

    const chunkIndex = Number.parseInt(c.req.param("chunkIndex"), 10);
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return c.json({ error: "Invalid chunk index" }, 400);
    }

    const recording = await getRecording(
      c.get("db"),
      c.req.param("recordingId"),
      c.req.param("roomId"),
    );
    if (!recording) return c.json({ error: "Recording not found" }, 404);
    if (recording.userId !== auth.user.id)
      return c.json({ error: "Forbidden" }, 403);
    if (recording.status !== "recording")
      return c.json({ error: "Recording is not accepting chunks" }, 409);
    if (!c.req.raw.body) return c.json({ error: "Missing chunk body" }, 400);

    const extension = extensionForMime(recording.mimeType);
    const r2Key = `${recording.r2Prefix}/chunks/${String(chunkIndex).padStart(6, "0")}.${extension}`;
    const byteLengthHeader =
      c.req.header("x-byte-length") ?? c.req.header("content-length") ?? "0";
    const byteLength = Number.isFinite(Number(byteLengthHeader))
      ? Number(byteLengthHeader)
      : 0;

    await c.env.RECORDINGS.put(r2Key, c.req.raw.body, {
      httpMetadata: {
        contentType: c.req.header("content-type") ?? recording.mimeType,
      },
      customMetadata: {
        roomId: recording.roomId,
        recordingId: recording.id,
        recordingSessionId: recording.recordingSessionId ?? recording.id,
        userId: auth.user.id,
        chunkIndex: String(chunkIndex),
        quality: recording.quality,
        frameRate: String(recording.frameRate),
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
        target: [
          schema.recordingChunks.recordingId,
          schema.recordingChunks.chunkIndex,
        ],
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
  },
);

app.post("/api/rooms/:roomId/recordings/:recordingId/complete", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const recording = await getRecording(
    c.get("db"),
    c.req.param("recordingId"),
    c.req.param("roomId"),
  );
  if (!recording) return c.json({ error: "Recording not found" }, 404);
  if (recording.userId !== auth.user.id)
    return c.json({ error: "Forbidden" }, 403);

  const input = await parseJson(c, completeRecordingSchema);
  if (!input.success) return c.json({ error: input.error }, 400);

  const chunks = await c
    .get("db")
    .select()
    .from(schema.recordingChunks)
    .where(eq(schema.recordingChunks.recordingId, recording.id))
    .orderBy(asc(schema.recordingChunks.chunkIndex));

  const now = new Date();
  const syncStoppedAt = input.data.syncStoppedAt
    ? new Date(input.data.syncStoppedAt)
    : now;
  const syncStartedAt = recording.syncStartedAt ?? recording.startedAt;
  const chunkCount = chunks.length || input.data.chunkCount;
  await c.env.RECORDINGS.put(
    `${recording.r2Prefix}/manifest.json`,
    JSON.stringify(
      {
        recordingId: recording.id,
        roomId: recording.roomId,
        userId: recording.userId,
        recordingSessionId: recording.recordingSessionId ?? recording.id,
        quality: recording.quality,
        frameRate: recording.frameRate,
        mimeType: recording.mimeType,
        durationMs: input.data.durationMs,
        localStartedAt: recording.startedAt.toISOString(),
        syncStartedAt: syncStartedAt.toISOString(),
        syncStoppedAt: syncStoppedAt.toISOString(),
        syncOffsetMs: recording.startedAt.getTime() - syncStartedAt.getTime(),
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
      syncStoppedAt,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.recordings.id, recording.id));

  return c.json({
    ok: true,
    manifestKey: `${recording.r2Prefix}/manifest.json`,
  });
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
      : and(
          eq(schema.recordings.roomId, roomId),
          eq(schema.recordings.userId, auth.user.id),
        );

  const rows = await c
    .get("db")
    .select({
      recording: schema.recordings,
      owner: {
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
      },
    })
    .from(schema.recordings)
    .leftJoin(schema.user, eq(schema.recordings.userId, schema.user.id))
    .where(where)
    .orderBy(desc(schema.recordings.createdAt))
    .limit(100);

  const recordings = rows.map(({ recording, owner }) => ({
    ...recording,
    owner,
  }));

  return c.json({ recordings });
});

app.get("/api/recordings/:recordingId/download", async (c) => {
  const auth = await getSession(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const recording = await getRecording(c.get("db"), c.req.param("recordingId"));
  if (!recording) return c.json({ error: "Recording not found" }, 404);

  const room = await getRoom(c.get("db"), recording.roomId);
  if (!room) return c.json({ error: "Room not found" }, 404);
  if (recording.userId !== auth.user.id && room.ownerUserId !== auth.user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (recording.status !== "completed") {
    return c.json({ error: "Recording is not completed" }, 409);
  }

  const chunks = await c
    .get("db")
    .select()
    .from(schema.recordingChunks)
    .where(eq(schema.recordingChunks.recordingId, recording.id))
    .orderBy(asc(schema.recordingChunks.chunkIndex));

  if (!chunks.length)
    return c.json({ error: "Recording has no uploaded chunks" }, 404);

  const headers = new Headers();
  headers.set("content-type", recording.mimeType || "application/octet-stream");
  headers.set(
    "content-disposition",
    `attachment; filename="${downloadFileName(room.name, recording.id, recording.mimeType)}"`,
  );
  headers.set("cache-control", "private, max-age=60");
  headers.set("x-recording-id", recording.id);
  headers.set(
    "x-recording-session-id",
    recording.recordingSessionId ?? recording.id,
  );
  if (recording.syncStartedAt) {
    headers.set("x-sync-started-at", recording.syncStartedAt.toISOString());
  }
  headers.set("x-recording-chunks", String(chunks.length));

  if (chunks.every((chunk) => chunk.byteLength > 0)) {
    const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    headers.set("content-length", String(totalBytes));
  }

  return new Response(createRecordingDownloadStream(c.env.RECORDINGS, chunks), {
    headers,
  });
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

async function getSession(
  c: AppContext,
): Promise<{ user: any; session: any } | null> {
  return c
    .get("auth")
    .api.getSession({ headers: c.req.raw.headers }) as Promise<{
    user: any;
    session: any;
  } | null>;
}

async function parseJson<T extends z.ZodTypeAny>(
  c: AppContext,
  parser: T,
  fallback?: unknown,
): Promise<
  { success: true; data: z.infer<T> } | { success: false; error: string }
> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    if (fallback === undefined)
      return { success: false, error: "Expected JSON body" };
    body = fallback;
  }

  const parsed = parser.safeParse(body);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((issue) => issue.message).join(", "),
    };
  }
  return { success: true, data: parsed.data };
}

async function getRoom(db: Database, roomId: string) {
  const [room] = await db
    .select()
    .from(schema.rooms)
    .where(eq(schema.rooms.id, roomId))
    .limit(1);
  return room ?? null;
}

async function getRecording(
  db: Database,
  recordingId: string,
  roomId?: string,
) {
  const where = roomId
    ? and(
        eq(schema.recordings.id, recordingId),
        eq(schema.recordings.roomId, roomId),
      )
    : eq(schema.recordings.id, recordingId);
  const [recording] = await db
    .select()
    .from(schema.recordings)
    .where(where)
    .limit(1);
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

function downloadFileName(
  roomName: string,
  recordingId: string,
  mimeType: string,
) {
  const safeRecordingId = recordingId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `${slugify(roomName)}-${safeRecordingId}.${extensionForMime(mimeType)}`;
}

function createRecordingDownloadStream(
  bucket: R2Bucket,
  chunks: Array<{ r2Key: string; chunkIndex: number }>,
) {
  let chunkPosition = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        if (!reader) {
          if (chunkPosition >= chunks.length) {
            controller.close();
            return;
          }

          const chunk = chunks[chunkPosition];
          const object = await bucket.get(chunk.r2Key);
          if (!object?.body) {
            controller.error(
              new Error(`Missing recording chunk ${chunk.chunkIndex}`),
            );
            return;
          }
          reader = object.body.getReader();
        }

        const activeReader = reader;
        const { done, value } = await activeReader.read();
        if (reader !== activeReader) return;
        if (done) {
          activeReader.releaseLock();
          reader = null;
          chunkPosition += 1;
          continue;
        }

        if (value) controller.enqueue(value);
        return;
      }
    },
    async cancel() {
      const activeReader = reader;
      reader = null;
      await activeReader?.cancel();
    },
  });
}

export default app;
