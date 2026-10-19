import { bearerToken, verifyJwt, type JwtEnv } from "./jwt"

export interface AdminEnv extends JwtEnv {
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_ANON_KEY: string
}

export type AdminCheck = { ok: true } | { ok: false; status: number; error: string }

/**
 * Verifies the caller's Supabase JWT and that their profile has
 * `is_admin = true`. The profile is read with the caller's own token, so
 * row-level security decides what they can see — the same gate the
 * submissions endpoints rely on.
 */
export async function requireAdmin(
  request: Request,
  env: AdminEnv
): Promise<AdminCheck> {
  const token = bearerToken(request)
  if (!token) return { ok: false, status: 401, error: "Não autenticado" }

  const jwt = await verifyJwt(token, env)
  if (!jwt.ok) return { ok: false, status: 401, error: `Token inválido: ${jwt.reason}` }

  const res = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(jwt.sub)}&select=is_admin`,
    {
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    }
  )
  if (!res.ok) return { ok: false, status: 502, error: "Não foi possível validar o perfil." }
  const rows = (await res.json()) as Array<{ is_admin?: boolean }>
  if (rows[0]?.is_admin !== true) return { ok: false, status: 403, error: "Sem permissões." }
  return { ok: true }
}
