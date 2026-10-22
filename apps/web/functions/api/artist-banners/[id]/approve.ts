import { normalizeText } from "../../../../src/lib/normalize"
import { requireAdmin, type AdminEnv } from "../../_lib/admin"
import {
  approvedKey,
  checkBannerConfig,
  fetchSubmission,
  json,
  pendingKey,
  publicUrl,
  restHeaders,
  UUID_RE,
  type BannerEnv,
} from "../../_lib/artist-banner"
import { bearerToken } from "../../_lib/jwt"

/**
 * `POST /api/artist-banners/<id>/approve` (admins): makes a suggested banner
 * the artist's banner. The waiting image is copied to the artist's own key,
 * replacing any earlier banner, so the author uploading again afterwards
 * can't change what is live.
 */
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
  const token = bearerToken(request)!

  const submission = await fetchSubmission(env, token, id)
  if (!submission || submission.status !== "pending") {
    return json({ error: "Sugestão não encontrada ou já decidida." }, 404)
  }

  const bucket = env.AVATAR_BUCKET!
  const image = await bucket.get(pendingKey(id))
  if (!image) return json({ error: "A imagem desta sugestão não existe." }, 404)

  const artistKey = normalizeText(submission.artist_name.trim())
  const key = await approvedKey(artistKey)
  await bucket.put(key, await image.arrayBuffer(), {
    httpMetadata: {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable",
    },
  })

  // `?v=` makes browsers fetch the new image when a banner is replaced.
  const bannerUrl = `${publicUrl(env, key)}?v=${Date.now()}`
  const base = `${env.VITE_SUPABASE_URL}/rest/v1`
  const saved = await fetch(`${base}/artist_banners?on_conflict=artist_key`, {
    method: "POST",
    headers: {
      ...restHeaders(env, token),
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      artist_key: artistKey,
      artist_name: submission.artist_name,
      banner_url: bannerUrl,
      updated_at: new Date().toISOString(),
    }),
  })
  if (!saved.ok)
    return json({ error: "Não foi possível guardar o banner." }, 502)

  await fetch(`${base}/artist_banner_submissions?id=eq.${id}`, {
    method: "PATCH",
    headers: restHeaders(env, token),
    body: JSON.stringify({ status: "approved" }),
  })
  await bucket.delete(pendingKey(id)).catch(() => undefined)
  return json({ ok: true })
}
