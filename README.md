# Videocast Recorder

A Cloudflare-native videocast prototype using:

- **Hono** on Cloudflare Workers for the app/API
- **Better Auth** for email/password accounts
- **Drizzle ORM** with **Cloudflare D1** for metadata
- **Cloudflare R2** for local recording chunks
- **Durable Objects** for WebRTC signaling
- Browser **MediaRecorder** for background local recordings with user-selectable quality and frame rate up to 4K 60 FPS

## Architecture

- Users sign up/sign in with Better Auth.
- Authenticated users create open videocast rooms.
- Guests join rooms and connect peer-to-peer over WebRTC.
- A Durable Object per room relays SDP/ICE signaling messages.
- Each participant records their own local camera/mic stream in the browser.
- Recording quality and frame-rate presets, including 2K, Ultra 4K, and 60 FPS options, are exposed by `/api/recording-qualities`.
- MediaRecorder emits chunks every 5s; chunks upload to R2 under:
  `rooms/{roomId}/recordings/{recordingId}/chunks/{000000}.webm`
- On completion, the Worker writes `rooms/{roomId}/recordings/{recordingId}/manifest.json` to R2.
- Completed recordings can be downloaded as a single media file streamed from their ordered R2 chunks.
- D1 stores users, sessions, rooms, participants, recordings, and uploaded chunks.

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Open http://localhost:8787.

## Cloudflare setup

Create the Cloudflare resources:

```bash
wrangler d1 create videocast-recorder
wrangler r2 bucket create videocast-recordings
```

Update `wrangler.toml` with the D1 `database_id` returned by Cloudflare.

Set production secrets:

```bash
wrangler secret put BETTER_AUTH_SECRET
```

Optional production vars in `wrangler.toml` or Cloudflare dashboard:

```toml
[vars]
BETTER_AUTH_URL = "https://your-domain.example"
APP_ORIGIN = "https://your-domain.example"
```

Apply remote migrations and deploy:

```bash
npm run db:migrate:remote
npm run deploy
```

## Scripts

- `npm run dev` - run Wrangler locally
- `npm run typecheck` - TypeScript check
- `npm run auth:schema:generate` - regenerate the Better Auth Drizzle schema (`src/db/auth-schema.gen.ts`)
- `npm run db:generate` - regenerate the auth schema, then generate Drizzle migrations from schema changes
- `npm run db:migrate:local` - apply D1 migrations locally
- `npm run db:migrate:remote` - apply D1 migrations remotely
- `npm run deploy` - deploy Worker

## Notes

This prototype uses P2P mesh WebRTC, which is best for small rooms. For larger rooms or stronger NAT traversal, add a production TURN/SFU layer such as Cloudflare Calls, and feed its ICE/session details into the room client.
