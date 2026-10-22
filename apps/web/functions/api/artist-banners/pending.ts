import { requireAdmin, type AdminEnv } from "../_lib/admin"
import {
  checkBannerConfig,
  pendingKey,
  publicUrl,
  restHeaders,
  type BannerEnv,
  type Submission,
} from "../_lib/artist-banner"
import { json } from "../_lib/http"
import { bearerToken } from "../_lib/jwt"

/**
 * `GET /api/artist-banners/pending` (admins) — the suggestions waiting for a
 * decision, each with the URL of its waiting image. Built here because only
 * the server knows where the images are stored.
 */
export const onRequestGet: PagesFunction<BannerEnv & AdminEnv> = async ({
  request,
  env,
}) => {
  const configError = checkBannerConfig(env)
  if (configError) return configError
  const admin = await requireAdmin(request, env)
  if (!admin.ok) return json({ error: admin.error }, admin.status)

  const res = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/artist_banner_submissions` +
      `?status=eq.pending&select=*&order=created_at.asc`,
    { headers: restHeaders(env, bearerToken(request)!) }
  )
  if (!res.ok) return json({ error: "Não foi possível carregar." }, 502)
  const rows = (await res.json()) as Submission[]
  return json(
    rows.map((row) => ({
      id: row.id,
      artistName: row.artist_name,
      createdAt: row.created_at,
      imageUrl: publicUrl(env, pendingKey(row.id)),
    }))
  )
}
