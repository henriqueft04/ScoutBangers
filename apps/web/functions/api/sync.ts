/**
 * Admin-only trigger for the Drive→R2 sync worker. The worker itself
 * lives at SYNC_WORKER_URL and is gated by SYNC_WORKER_TOKEN — both
 * stay server-side so a curious user can't grep the bundle for the
 * token and spam Drive's quota.
 *
 * Auth: requires a valid Supabase JWT whose `email` claim is listed in
 * ADMIN_EMAILS (comma-separated). Everyone else gets 403.
 */

import { bearerToken, verifyJwt, type JwtEnv } from "./_lib/jwt"

interface Env extends JwtEnv {
  SYNC_WORKER_URL: string
  SYNC_WORKER_TOKEN: string
  ADMIN_EMAILS: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
}

function adminAllowlist(env: Env): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  )
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SYNC_WORKER_URL || !env.SYNC_WORKER_TOKEN || !env.ADMIN_EMAILS) {
    return json(
      { error: "Sincronização não configurada (faltam variáveis de ambiente)." },
      503
    )
  }

  const token = bearerToken(request)
  if (!token) return json({ error: "Não autenticado" }, 401)

  const result = await verifyJwt(token, env)
  if (!result.ok) {
    return json({ error: `Token inválido: ${result.reason}` }, 401)
  }

  const email = result.email?.toLowerCase()
  if (!email || !adminAllowlist(env).has(email)) {
    return json({ error: "Sem permissões." }, 403)
  }

  const url = new URL(env.SYNC_WORKER_URL)
  url.searchParams.set("token", env.SYNC_WORKER_TOKEN)
  const upstream = await fetch(url.toString(), { method: "GET" })
  const body = await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
}
