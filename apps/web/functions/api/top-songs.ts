import {
  CHART_MAX_AGE_MS,
  CHART_PERIODS,
  CHART_SIZE,
  isChartPeriod,
} from "../../src/lib/top-songs-config"

/**
 * `GET /api/top-songs?period=week|all` — the home page's top-20 chart.
 *
 * It is the same `stats_top_songs` call the browser used to make straight to
 * Supabase, but answered from Cloudflare's edge cache whenever a recent copy
 * exists. The all-time chart adds up every play ever recorded, so behind this
 * only one visitor per data center per few minutes pays for it; everyone else
 * gets the cached answer in milliseconds, and the database is not asked at all.
 */
interface Env {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

const STATE_HEADER = "X-Top-Songs-Cache"

function reply(body: BodyInit, status: number, state?: "HIT" | "MISS"): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // The edge copy is the cache; the browser keeps its own (see the
      // client), so a second HTTP cache here would only add staleness.
      "Cache-Control": "no-store",
      ...(state ? { [STATE_HEADER]: state } : {}),
    },
  })
}

const failure = (message: string, status: number) =>
  reply(JSON.stringify({ error: message }), status)

/**
 * Cloudflare's cache for this data center. The standard `CacheStorage` type
 * doesn't know about `default`, and under Node (`npm run dev`) there is no
 * cache at all — callers then simply go to the database every time.
 */
function edgeCache(): Cache | undefined {
  return typeof caches === "undefined"
    ? undefined
    : (caches as unknown as { default: Cache }).default
}

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  waitUntil,
}) => {
  const url = new URL(request.url)
  const period = url.searchParams.get("period")
  if (!isChartPeriod(period)) {
    return failure(`period must be one of: ${CHART_PERIODS.join(", ")}`, 400)
  }
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    return failure("Server misconfigured: Supabase URL or key is unset.", 500)
  }

  // One cache entry per chart, whatever else the query string carries —
  // otherwise `?period=all&x=1`, `&x=2`, … would each cost a database call.
  const cache = edgeCache()
  const cacheKey = new Request(`${url.origin}${url.pathname}?period=${period}`)

  const hit = await cache?.match(cacheKey)
  if (hit) return reply(hit.body ?? "[]", 200, "HIT")

  let upstream: Response
  try {
    upstream = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/stats_top_songs`, {
      method: "POST",
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ period, lim: CHART_SIZE }),
    })
  } catch {
    return failure("Could not reach Supabase.", 502)
  }
  // A failure is never cached: the next visitor tries again.
  if (!upstream.ok) return failure("Supabase request failed.", 502)

  const rows = await upstream.text()
  if (cache) {
    waitUntil(
      cache.put(
        cacheKey,
        new Response(rows, {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            // How long the edge may serve this copy.
            "Cache-Control": `public, max-age=${CHART_MAX_AGE_MS[period] / 1000}`,
          },
        })
      )
    )
  }
  return reply(rows, 200, "MISS")
}
