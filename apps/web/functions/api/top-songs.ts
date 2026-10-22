import {
  CHART_MAX_AGE_MS,
  CHART_PERIODS,
  CHART_SIZE,
  isChartPeriod,
} from "../../src/lib/top-songs-config"
import { cachedRpc, type RpcEnv } from "./_lib/cached-rpc"

/**
 * `GET /api/top-songs?period=week|all` — the home page's top-20 chart.
 *
 * It is the same `stats_top_songs` call the browser used to make straight to
 * Supabase, but answered from Cloudflare's edge cache whenever a recent copy
 * exists. The all-time chart adds up every play ever recorded, so behind this
 * only one visitor per data center per few minutes pays for it; everyone else
 * gets the cached answer in milliseconds, and the database is not asked at all.
 */
const STATE_HEADER = "X-Top-Songs-Cache"

function reply(
  body: BodyInit,
  status: number,
  state?: "HIT" | "MISS"
): Response {
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

export const onRequestGet: PagesFunction<RpcEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  const period = new URL(request.url).searchParams.get("period")
  if (!isChartPeriod(period)) {
    return failure(`period must be one of: ${CHART_PERIODS.join(", ")}`, 400)
  }

  const result = await cachedRpc({
    request,
    env,
    waitUntil,
    rpc: "stats_top_songs",
    args: { period, lim: CHART_SIZE },
    key: `period=${period}`,
    maxAgeSeconds: CHART_MAX_AGE_MS[period] / 1000,
  })
  return result.ok
    ? reply(result.body, 200, result.state)
    : failure(result.error, result.status)
}
