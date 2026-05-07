# ScoutBangers

A minimalist, mobile-first web music player that streams songs from a public Google Drive folder. Built with React 19, Vite 7, Tailwind v4 and shadcn/ui. Deployable for free on Vercel and installable as a PWA on phones.

| | |
|---|---|
| **Palette** | Red `#7B2D26` and white `#F0F3F5` |
| **Source** | Public Google Drive folder, served via two tiny Vercel Edge functions |
| **Free hosting** | Vercel Hobby tier (1M function calls + 100 GB bandwidth/month) |
| **Install** | PWA — add to home screen on iOS/Android |

## Quick start

```bash
npm install
cd apps/web
cp .env.example .env.local      # fill DRIVE_API_KEY and DRIVE_FOLDER_ID
cd ../..
npm run dev                     # boots Vite dev server
```

The dev server only runs the SPA. To exercise `/api/songs` and `/api/stream/[id]` locally you also need the Vercel CLI:

```bash
npm install -g vercel
cd apps/web
vercel link                     # one-time, attach to a Vercel project
vercel dev                      # serves SPA + serverless functions on :3000
```

## Project structure

```
ScoutBangers/
├── apps/
│   └── web/                       # The Vite SPA + Vercel Edge functions
│       ├── api/
│       │   ├── songs.ts           # GET /api/songs       — Drive folder manifest
│       │   └── stream/[id].ts     # GET /api/stream/:id  — Range-aware audio proxy
│       ├── public/
│       │   ├── SB.png             # Source logo (red, 1402×1122)
│       │   ├── icon-*.png         # Generated PWA icons (do not edit by hand)
│       │   ├── manifest.webmanifest
│       │   └── sw.js              # Minimal service worker (PWA installability)
│       └── src/
│           ├── App.tsx            # Wraps PlayerProvider + AppShell
│           ├── components/
│           │   ├── layout/        # AppShell, Header
│           │   ├── library/       # SongList, SongRow, SearchInput, EmptyState …
│           │   └── player/        # PlayerProvider, PlayerBar, NowPlaying,
│           │                      # MainControls, ProgressBar, VolumeControl
│           ├── hooks/             # usePlayer, useSongs, useFilteredSongs, …
│           └── lib/               # types, api, audio-url, format, shuffle, …
└── packages/
    └── ui/                        # Shared shadcn/ui components
        └── src/components/        # Button, Slider, Input, ScrollArea, Tooltip, Separator
```

## Architecture

```
┌────────── Browser (SPA) ──────────┐         ┌────── Vercel Edge ──────┐
│  PlayerProvider ── single <audio>  │  fetch │  /api/songs              │
│      │                              │ ─────► │  /api/stream/[id]        │
│      ├── Library                   │         │     │                    │
│      └── PlayerBar (sticky)        │         │     ▼                    │
└────────────────────────────────────┘         │  Google Drive API v3     │
                                               │  (DRIVE_API_KEY,         │
                                               │   DRIVE_FOLDER_ID env)   │
                                               └─────────────────────────┘
```

- The SPA holds a single `<audio>` element inside `PlayerProvider` and treats audio events (`play`, `pause`, `timeupdate`, `ended`, …) as the source of truth.
- `/api/songs` is cached on the Vercel edge for 5 minutes (stale-while-revalidate 10 minutes), so weekly Drive uploads propagate within minutes without hammering the Drive API.
- `/api/stream/[id]` forwards the client's `Range` header to Drive — without this, audio seek doesn't work because Drive blocks Range in CORS responses.
- The Drive API key never reaches the client; it lives only as a Vercel env var.

## Adding songs (weekly workflow)

1. Drop new MP3s into the public Drive folder.
2. Wait up to 5 min for the edge cache to expire — or hit the refresh button in the header to bypass the cache.
3. Friends see the new tracks on their next visit.

Filenames map to titles. `Artist - Title.mp3` is parsed into `{ artist: "Artist", title: "Title" }`. Plain `Title.mp3` is shown without an artist.

## Deploying to Vercel (free)

1. Create a Drive folder and set sharing to **Anyone with the link → Viewer**.
2. In Google Cloud Console: create a project, enable the **Google Drive API**, create an **API key**. Restrict it to the Drive API.
3. Push this repo to GitHub.
4. On [vercel.com](https://vercel.com) → **Add New → Project** → import your repo.
5. **Important**: set **Root Directory** to `apps/web`.
6. Under **Environment Variables**, add:
   - `DRIVE_API_KEY` — the key from step 2
   - `DRIVE_FOLDER_ID` — the segment after `/folders/` in the Drive URL
7. **Deploy**. Vercel returns a URL like `scoutbangers.vercel.app`. Open it on your phone and **Add to Home Screen** to install as a PWA.

### If you outgrow Vercel's free bandwidth (100 GB/month)

Migrate the same SPA + functions to **Cloudflare Pages** (unlimited bandwidth on free tier). The only change required is moving `apps/web/api/*.ts` to `apps/web/functions/api/*.ts` and updating the function signatures from Vercel Edge `(request: Request)` to Cloudflare Pages `(context: EventContext)`. Same logic, ~10 line diff.

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
