import { requireAdmin, type AdminEnv } from "../../_lib/admin"
import {
  checkBannerConfig,
  pendingKey,
  restHeaders,
  UUID_RE,
  type BannerEnv,
} from "../../_lib/artist-banner"
import { json } from "../../_lib/http"
import { bearerToken } from "../../_lib/jwt"

/** `POST /api/artist-banners/<id>/reject` (admins): declines a suggestion. */
export const onRequestPost: PagesFunction<BannerEnv & AdminEnv> = async ({
  request,
  env,
  params,
}) => {
  const id = String(params.id ?? "")
  if (!UUID_RE.test(id)) return json({ error: "Sugestão inválida" }, 400)
  const configError = checkBannerConfig(env)
  if (configError) return configError
  const admin = await requireAdmin(request, env)
  if (!admin.ok) return json({ error: admin.error }, admin.status)

  const res = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/artist_banner_submissions?id=eq.${id}&status=eq.pending`,
    {
      method: "PATCH",
      headers: {
        ...restHeaders(env, bearerToken(request)!),
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status: "rejected" }),
    }
  )
  const updated = res.ok ? ((await res.json()) as unknown[]) : []
  if (updated.length === 0) {
    return json({ error: "Sugestão não encontrada ou já decidida." }, 404)
  }
  await env.AVATAR_BUCKET!.delete(pendingKey(id)).catch(() => undefined)
  return json({ ok: true })
}
