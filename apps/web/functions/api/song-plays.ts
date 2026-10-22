import { cachedRpc, type RpcEnv } from "./_lib/cached-rpc"
import { json } from "./_lib/http"

/**
 * `GET /api/song-plays` — all-time play count of every song, as
 * `[{ song_id, play_count }]`. Artist pages and album covers need these
 * counts, which are the same for every visitor and every page, but computing
 * them reads the whole `plays` table. So they are answered from Cloudflare's
 * edge cache: one such read per data center every few minutes, however many
 * pages are opened.
 */

const MAX_AGE_SECONDS = 10 * 60
/** More songs than the library will ever hold: effectively "all of them". */
const ALL_SONGS = 10_000

export const onRequestGet: PagesFunction<RpcEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  const result = await cachedRpc({
    request,
    env,
    waitUntil,
    rpc: "stats_top_songs",
    args: { period: "all", lim: ALL_SONGS },
    key: "all",
    maxAgeSeconds: MAX_AGE_SECONDS,
  })
  // The edge copy is the cache; the client keeps its own.
  const noStore = { "Cache-Control": "no-store" }
  return result.ok
    ? new Response(result.body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...noStore,
        },
      })
    : json({ error: result.error }, result.status, noStore)
}
