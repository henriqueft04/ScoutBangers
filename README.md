# ScoutBangers

A minimalist, mobile-first web music player. Built with React 19, Vite 7, Tailwind v4 and shadcn/ui. Hosted free on Cloudflare Pages with audio served direct from Cloudflare R2 (zero egress fees). Installable as a PWA on phones.

| | |
|---|---|
| **Palette** | Red `#7B2D26` and white `#F0F3F5` |
| **Catalog source** | Public Google Drive folder, mirrored hourly into R2 by a Cron Worker |
| **Audio storage** | Cloudflare R2 (custom domain `audio.scoutbangers.com`) |
| **Hosting** | Cloudflare Pages (SPA + `/api/songs` + `/api/lyrics`) |
| **Install** | PWA — add to home screen on iOS/Android |

## Quick start

```bash
npm install
cd apps/web
cp .env.example .env.local      # fill DRIVE_API_KEY and DRIVE_FOLDER_ID
cd ../..
npm run dev                     # boots Vite dev server
```

The dev server only runs the SPA. To exercise `/api/songs` and `/api/lyrics` locally use Wrangler against the Pages Functions:

```bash
npm install -g wrangler
cd apps/web
npm run build
npx wrangler pages dev dist     # serves SPA + functions on :8788
```

## Project structure

```
ScoutBangers/
├── apps/
│   └── web/                       # The Vite SPA + Cloudflare Pages Functions
│       ├── functions/api/
│       │   ├── songs.ts           # GET /api/songs   — Drive folder manifest
│       │   ├── lyrics.ts          # GET /api/lyrics  — Cancioneiro doc → JSON
│       │   └── _lib/drive-auth.ts # Service-account JWT for Drive API
│       ├── public/
│       │   ├── _headers           # Cloudflare Pages security headers (CSP etc.)
│       │   ├── _redirects         # SPA fallback routing
│       ├── public/
│       │   ├── SB.png             # Source logo (red, 1402×1122)
│       │   ├── icon-*.png         # Generated PWA icons (do not edit by hand)
│       │   ├── manifest.webmanifest
│       │   └── sw.js              # Minimal service worker (PWA installability)
│       └── src/                   # React app (PlayerProvider, components, hooks, lib)
├── workers/
│   └── drive-sync/                # Cron Worker: mirrors Drive folder into R2
│       ├── src/index.ts           # scheduled() + manual ?token=… trigger
│       └── wrangler.toml          # cron schedule + R2 binding
└── packages/
    └── ui/                        # Shared shadcn/ui components
```

## Architecture

```
        Browser (SPA on scoutbangers.com)
            │
            │ fetch /api/songs, /api/lyrics      <audio src="audio.scoutbangers.com/<drive-id>">
            │                                      │
            ▼                                      ▼
   ┌─────────────────────┐                   ┌────────────────────────┐
   │ Cloudflare Pages    │                   │ Cloudflare R2          │
   │ Functions (Drive)   │                   │ public bucket on       │
   │                     │                   │ audio.scoutbangers.com │
   └─────────────────────┘                   └────────────────────────┘
                                                      ▲
                                                      │ R2 put (new files)
                                             ┌────────────────────────┐
                                             │ Cron Worker (15 min)   │
                                             │ Drive list → R2 mirror │
                                             └────────────────────────┘
```

- Audio bytes never touch any compute path: R2 → user direct, $0 egress regardless of volume.
- `Song.id` = Drive file ID = R2 object key. Historical Supabase data (plays, stats, lyrics) keeps working unchanged.
- `/api/songs` is cached at the edge for 5 min so Drive isn't hammered.
- The Drive service-account credentials live only in Pages + Worker env, never in the client bundle.

## Adding songs (weekly workflow)

1. Drop new MP3s into the public Drive folder.
2. Wait up to 5 min for the edge cache to expire — or hit the refresh button in the header to bypass the cache.
3. Friends see the new tracks on their next visit.

Filenames map to titles. `Artist - Title.mp3` is parsed into `{ artist: "Artist", title: "Title" }`. Plain `Title.mp3` is shown without an artist.

## Deploying to Cloudflare (free)

Three pieces: an R2 bucket, a Pages project, and a Worker. Domain `scoutbangers.com` should already be on Cloudflare.

### 1. R2 bucket

In the Cloudflare dashboard → **R2** → *Create bucket*:
- Name: `scoutbangers-audio`
- Once created, **Settings → Custom domains → Connect domain** → `audio.scoutbangers.com`. Cloudflare creates the DNS record automatically and serves the bucket publicly with Range support.

### 2. Drive→R2 sync Worker

```bash
cd workers/drive-sync
npm install
npx wrangler login                                   # one-time
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON  # paste the full service-account JSON
npx wrangler secret put SYNC_TOKEN                   # any random string
# Edit wrangler.toml: set DRIVE_FOLDER_ID under [vars]
npx wrangler deploy
# Kick off the initial backfill (cron will handle incremental from here):
curl "https://scoutbangers-drive-sync.<your-account>.workers.dev/?token=<SYNC_TOKEN>"
```

The Worker copies up to 20 new files per run; cron fires every 15 min, so an initial folder of ~hundreds of songs may take a few hours to fully mirror, or trigger the manual endpoint repeatedly.

### 3. Pages project

Cloudflare dashboard → **Pages → Create → Connect to Git → ** select repo. Build settings:

- **Framework preset**: None
- **Build command**: `npm install && npm run build --filter=scoutbangers-web`
- **Build output directory**: `apps/web/dist`
- **Root directory** (advanced): leave at `/`
- **Environment variables** (Production + Preview):
  - `DRIVE_FOLDER_ID`
  - `LYRICS_DRIVE_FILE_ID`
  - `GOOGLE_SERVICE_ACCOUNT_JSON` (paste full JSON; mark as encrypted)
  - `VITE_AUDIO_BASE_URL=https://audio.scoutbangers.com`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

After the first deploy, attach the custom domain: Pages project → **Custom domains** → add `scoutbangers.com` and `www.scoutbangers.com`.

## Customisation

- **Palette**: edit `packages/ui/src/styles/globals.css` — only the `:root` block. Every component reads from CSS tokens (`bg-primary`, `text-foreground`, etc.), so a single-file change re-skins the app.
- **Logo**: replace `apps/web/public/SB.png`, then regenerate icons:
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

## Scripts

Run from the repo root (Turbo orchestrates across workspaces):

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server for the web app |
| `npm run build` | Type-check + Vite production build |
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm run lint` | ESLint across all workspaces |
| `npm run format` | Prettier (no-semi, 2-space, double quotes) |

## License

Private — no license granted. Built for personal/friend use.
