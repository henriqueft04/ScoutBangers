# 🎸 ScoutBangers

A minimalist, mobile-first web music player and community platform. Built with React 19, Vite 7, Tailwind v4, and shadcn/ui. 
Hosted free on Cloudflare Pages with audio served directly from Cloudflare R2 (zero egress fees), and powered by Supabase for authentication and database. Installable as a PWA on iOS/Android.

| | |
|---|---|
| **🎨 Palette** | Red `#7B2D26` and white `#F0F3F5` |
| **📁 Catalog source** | Public Google Drive folder, mirrored hourly into R2 by a Cron Worker |
| **🎵 Audio storage** | Cloudflare R2 (custom domain `audio.scoutbangers.com`) |
| **☁️ Hosting** | Cloudflare Pages (SPA + `/api/*` edge functions) |
| **🗄️ Database & Auth** | Supabase (PostgreSQL + Google OAuth) |
| **💬 Global chat** | Cloudflare Durable Object (`workers/chat`) — own storage, zero Supabase load |
| **📱 Install** | PWA — add to home screen |

## ✨ Features
- **Seamless Playback**: Background audio streaming powered by Howler.js.
- **Offline Support**: Songs can be saved offline using the Cache API.
- **Community Submissions**: Users can upload new songs and thumbnails directly in the app.
- **Admin Dashboard**: Approvals workflow for community submissions, pushing accepted tracks seamlessly to Google Drive and R2.
- **User Profiles & Playlists**: Authenticated users can build public/private playlists, track play counts, and view listening stats.
- **Live Lyrics**: Parses a Google Doc ("Cancioneiro") into timestamped lyrics.
- **Global Chat**: Real-time community chat, backed by a Cloudflare Durable Object rather than Supabase — keeps the database's connection/RAM budget untouched as the app grows.

## 🚀 Quick Start

```bash
npm install
cd apps/web
cp .env.example .env.local      # Fill in the required Supabase & Google keys
cd ../..
npm run dev                     # Boots Vite dev server (frontend only)
```

> **Note**: The dev server only runs the SPA. To test the backend API functions (`/api/songs`, `/api/submissions/*`, etc.) locally, use Wrangler:

```bash
npm install -g wrangler
cd apps/web
npm run build
npx wrangler pages dev dist     # Serves SPA + API functions on :8788
```

## 🏗️ Architecture

```text
        Browser (SPA on scoutbangers.com)
            │
            ├─► fetch /api/songs, /api/lyrics      <audio src="audio.scoutbangers.com/...">
            ├─► upload to Supabase Storage           │
            │                                        │
            ▼                                        ▼
    ┌──────────────────────┐             ┌────────────────────────┐
    │ Cloudflare Pages     │             │ Cloudflare R2          │
    │ Functions (API)      │             │ audio.scoutbangers.com │
    └──────────┬───────────┘             └───────────▲────────────┘
               │                                     │ R2 put (new files)
               │ (Admins approve)            ┌───────┴────────────────┐
               ▼                             │ Cron Worker (15 min)   │
    ┌──────────────────────┐                 │ Drive list → R2 mirror │
    │ Google Drive API     │                 └───────▲────────────────┘
    │ (Master Source)      │                         │
    └──────────────────────┘                         │
                                                     │
    ┌──────────────────────┐                         │
    │ Supabase             │                         │
    │ DB (Auth, Profiles)  │─────────────────────────┘
    │ Storage (Pending)    │
    └──────────────────────┘
```

- **Zero Egress**: Audio bytes stream directly from Cloudflare R2 to users, costing $0 in egress fees regardless of volume.
- **Single Source of Truth**: `Song.id` = Google Drive file ID = R2 object key = Supabase references.
- **Caching**: `/api/songs` is cached at the edge to prevent rate limits from Google Drive.
- **Secure Credentials**: Google Service Account JSON lives only in Cloudflare Pages/Worker environment variables, never reaching the client.
- **Chat off the database**: The SPA opens a WebSocket straight to a Cloudflare Durable Object (`workers/chat`, `chat.scoutbangers.com`) for global chat. Message history lives in the Durable Object's own SQLite storage — Supabase is only consulted for auth (JWT, verified locally) and a one-off profile lookup per connection, so chat traffic never adds Postgres connection/RAM load.

## 📥 Adding Songs

### Community Workflow (Recommended)
1. Users navigate to the **Submit** page inside the app.
2. They upload an MP3 and an optional cover image.
3. The files are securely stored in the `submissions` Supabase bucket.
4. An Admin visits the **Admin Dashboard** and reviews the submission (approves or rejects).
5. Upon approval, the edge function transfers the file to Google Drive, deletes the temporary file in Supabase, and triggers the R2 Sync Worker to immediately publish it.

### Manual Workflow
1. Drop new MP3s directly into the designated Google Drive folder.
2. Wait up to 15 min for the Cron Worker to mirror it to R2, or hit the refresh button in the app header (if Admin).

*Filenames map to titles. `Artist - Title.mp3` is parsed into `{ artist: "Artist", title: "Title" }`. Plain `Title.mp3` is shown without an artist.*

## ☁️ Deploying to Cloudflare (Free)

Requires an R2 bucket, a Pages project, and a Sync Worker.

### 1. R2 bucket
In the Cloudflare dashboard → **R2** → *Create bucket*:
- Name: `scoutbangers-audio`
- Once created, go to **Settings → Custom domains → Connect domain** → `audio.scoutbangers.com`.

### 2. Drive→R2 Sync Worker
```bash
cd workers/drive-sync
npm install
npx wrangler login                                   # one-time
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON  # paste the full service-account JSON
npx wrangler secret put SYNC_TOKEN                   # any random secure string
# Edit wrangler.toml: set DRIVE_FOLDER_ID under [vars]
npx wrangler deploy
# Kick off the initial backfill (or let cron run):
curl "https://scoutbangers-drive-sync.<your-account>.workers.dev/?token=<SYNC_TOKEN>"
```

### 3. Chat Worker
```bash
cd workers/chat
npm install
npx wrangler login                                   # one-time, if not already
```
Edit `wrangler.toml`: set `SUPABASE_URL` and `SUPABASE_ANON_KEY` under `[vars]`
to the same values as your `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
```bash
npx wrangler deploy
```
Then in the Cloudflare dashboard → **Workers & Pages** → `scoutbangers-chat` →
**Settings → Domains & Routes → Custom Domains**, connect `chat.scoutbangers.com`.
After this one-time setup, pushes to `workers/chat/**` on `main` redeploy it
automatically via `.github/workflows/deploy-worker.yml` (same workflow that
deploys the Drive→R2 Sync Worker above).

### 4. Supabase Setup
- Run the SQL migrations inside `supabase/migrations/` sequentially in your Supabase project's SQL Editor.
- Ensure the `submissions` Storage Bucket is created and RLS policies from `supabase/schema.sql` are applied.
- Setup Google OAuth in Supabase Auth providers.

### 5. Pages Project
Cloudflare dashboard → **Pages → Create → Connect to Git** → select this repo.
- **Framework preset**: None
- **Build command**: `npm install && npm run build --filter=scoutbangers-web`
- **Build output directory**: `apps/web/dist`
- **Environment variables**:
  - `DRIVE_FOLDER_ID`
  - `LYRICS_DRIVE_FILE_ID`
  - `GOOGLE_SERVICE_ACCOUNT_JSON` (encrypted)
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (for Drive uploads)
  - `VITE_AUDIO_BASE_URL=https://audio.scoutbangers.com`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `SYNC_WORKER_URL` (e.g. `https://scoutbangers-drive-sync...`)
  - `SYNC_WORKER_TOKEN` (same as the Worker secret)
  - `VITE_CHAT_WORKER_URL` (e.g. `https://chat.scoutbangers.com`)

## 🎨 Customisation
- **Palette**: Edit `packages/ui/src/styles/globals.css` (only the `:root` block). The entire app's theme relies on these tokens.
- **Logo**: Replace `apps/web/public/SB.png`, then run the ImageMagick regeneration script:
  ```bash
  cd apps/web/public
  BG=$(magick SB.png -resize 1x1\! -format "%[hex:p{0,0}]" info:)
  W=$(magick identify -format "%w" SB.png) && H=$(magick identify -format "%h" SB.png)
  SIDE=$(( W > H ? W : H ))
  for s in 192 512; do
    magick SB.png -background "#$BG" -gravity center -extent ${SIDE}x${SIDE} \
      -resize ${s}x${s} icon-${s}.png
  done
  magick SB.png -background "#$BG" -gravity center -extent ${SIDE}x${SIDE} \
    -resize 180x180 apple-touch-icon.png
  magick SB.png -resize 96x icon-header.png
  ```

## 🛠️ Scripts
Run from the repository root:

| Command | Description |
|---|---|
| `npm run dev` | Boots the Vite dev server for the web app |
| `npm run build` | Type-checks and builds for production |
| `npm run typecheck` | Validates TypeScript (`tsc --noEmit`) across workspaces |
| `npm run lint` | ESLint across all workspaces |
| `npm run format` | Prettier (no-semi, 2-space, double quotes) |

## 📜 License
Private — no license granted. Built for personal/friend use.
