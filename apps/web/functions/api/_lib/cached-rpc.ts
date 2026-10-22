export interface RpcEnv {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export type CachedRpcResult =
  | { ok: true; body: string; state: "HIT" | "MISS" }
  | { ok: false; status: number; error: string }

interface CachedRpcOptions {
  request: Request
  env: RpcEnv
  waitUntil: (promise: Promise<unknown>) => void
  /** Name of the Postgres function, called with the anon key. */
  rpc: string
  args: unknown
  /** Identifies this answer in the cache (e.g. `period=all`). Only what the
   *  answer depends on: extra query-string junk must not mint new entries,
   *  each of which would cost a database call. */
  key: string
  maxAgeSeconds: number
}

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

/**
 * Calls a Supabase RPC, answering from the edge cache when a recent copy
 * exists, so the database is asked about once per answer per data center
 * per `maxAgeSeconds`. A failure is never cached: the next visitor retries.
 */
export async function cachedRpc({
  request,
  env,
  waitUntil,
  rpc,
  args,
  key,
  maxAgeSeconds,
}: CachedRpcOptions): Promise<CachedRpcResult> {
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    return {
      ok: false,
      status: 500,
      error: "Server misconfigured: Supabase URL or key is unset.",
    }
  }

  const url = new URL(request.url)
  const cache = edgeCache()
  const cacheKey = new Request(`${url.origin}${url.pathname}?${key}`)

  const hit = await cache?.match(cacheKey)
  if (hit) return { ok: true, body: await hit.text(), state: "HIT" }

  let upstream: Response
  try {
    upstream = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    })
  } catch {
    return { ok: false, status: 502, error: "Could not reach Supabase." }
  }
  if (!upstream.ok) {
    return { ok: false, status: 502, error: "Supabase request failed." }
  }

  const body = await upstream.text()
  if (cache) {
    waitUntil(
      cache.put(
        cacheKey,
        new Response(body, {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            // How long the edge may serve this copy.
            "Cache-Control": `public, max-age=${maxAgeSeconds}`,
          },
        })
      )
    )
  }
  return { ok: true, body, state: "MISS" }
}
