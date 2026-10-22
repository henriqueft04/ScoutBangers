import { cachedRpc, type RpcEnv } from "./_lib/cached-rpc"

/**
 * `GET /api/artist-listeners?name=<artist>` — the artist page's monthly
 * listeners. The count is a small query on `plays`, but artist pages can be
 * opened constantly, so it is answered from Cloudflare's edge cache: one
 * database call per artist per data center per hour, then cached copies.
 */

/** A monthly figure barely moves within an hour. */
const MAX_AGE_SECONDS = 60 * 60
/** Longer than any artist name, so a hostile caller can't fill the cache with junk. */
const MAX_NAME_LENGTH = 200

const reply = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })

export const onRequestGet: PagesFunction<RpcEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? ""
  if (!name || name.length > MAX_NAME_LENGTH) {
    return reply({ error: "name is required" }, 400)
  }

  const result = await cachedRpc({
    request,
    env,
    waitUntil,
    rpc: "artist_monthly_listeners",
    args: { artist_name: name },
    key: `name=${encodeURIComponent(name)}`,
    maxAgeSeconds: MAX_AGE_SECONDS,
  })
  if (!result.ok) return reply({ error: result.error }, result.status)
  return reply({ listeners: Number(result.body) })
}
