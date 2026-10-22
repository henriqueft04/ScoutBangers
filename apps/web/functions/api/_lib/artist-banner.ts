import { bearerToken, verifyJwt, type JwtEnv } from "./jwt"

export interface BannerEnv extends JwtEnv {
  AVATAR_BUCKET?: R2Bucket
  AVATAR_PUBLIC_BASE_URL?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Where a suggested (not yet approved) banner waits. */
export const pendingKey = (submissionId: string) =>
  `artist-pending-${submissionId.toLowerCase()}.jpg`

/** Where an artist's approved banner lives: one object per artist. */
export async function approvedKey(artistKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(artistKey)
  )
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return `artist-banner-${hex.slice(0, 24)}.jpg`
}

export const publicUrl = (env: BannerEnv, key: string) =>
  `${env.AVATAR_PUBLIC_BASE_URL!.replace(/\/+$/, "")}/${key}`

/** The storage and Supabase settings these endpoints need, or an error reply. */
export function checkBannerConfig(env: BannerEnv): Response | null {
  if (
    !env.AVATAR_BUCKET ||
    !env.AVATAR_PUBLIC_BASE_URL ||
    !env.VITE_SUPABASE_URL ||
    !env.VITE_SUPABASE_ANON_KEY
  ) {
    return json(
      {
        error:
          "Banners não disponíveis em desenvolvimento (faltam bindings R2 / secrets). Testa num preview deploy.",
      },
      503
    )
  }
  return null
}

/** Headers for a Supabase REST call made as the caller (RLS decides). */
export const restHeaders = (env: BannerEnv, token: string) => ({
  apikey: env.VITE_SUPABASE_ANON_KEY!,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
})

export interface Submission {
  id: string
  user_id: string
  artist_name: string
  status: string
  created_at: string
}

/**
 * Verifies the caller's token. `userId` is the token's `sub`; `token` is
 * passed on to Supabase so RLS applies to every query made for them.
 */
export async function authenticate(
  request: Request,
  env: BannerEnv
): Promise<{ userId: string; token: string } | Response> {
  const token = bearerToken(request)
  if (!token) return json({ error: "Não autenticado" }, 401)
  const result = await verifyJwt(token, env)
  if (!result.ok)
    return json({ error: `Token inválido: ${result.reason}` }, 401)
  return { userId: result.sub, token }
}

/** A submission the caller can read (their own, or any for an admin). */
export async function fetchSubmission(
  env: BannerEnv,
  token: string,
  id: string
): Promise<Submission | undefined> {
  const res = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/artist_banner_submissions?id=eq.${id}&select=*`,
    { headers: restHeaders(env, token) }
  )
  if (!res.ok) return undefined
  return ((await res.json()) as Submission[])[0]
}
