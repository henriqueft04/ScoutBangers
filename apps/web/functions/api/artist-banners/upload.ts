import {
  authenticate,
  checkBannerConfig,
  fetchSubmission,
  json,
  pendingKey,
  UUID_RE,
  type BannerEnv,
} from "../_lib/artist-banner"

/**
 * `POST /api/artist-banners/upload?id=<submission id>` — stores the image of
 * a banner suggestion (see `submit_artist_banner`). The image waits under a
 * key only that submission can write; an admin's approval is what copies it
 * to where the artist page reads it, so uploading never changes a live page.
 */

/** The cropper outputs ~1200×742 JPEGs; this is just a guard. */
const MAX_BYTES = 1024 * 1024

export const onRequestPost: PagesFunction<BannerEnv> = async ({
  request,
  env,
}) => {
  const configError = checkBannerConfig(env)
  if (configError) return configError
  const auth = await authenticate(request, env)
  if (auth instanceof Response) return auth

  const id = new URL(request.url).searchParams.get("id") ?? ""
  if (!UUID_RE.test(id)) return json({ error: "Sugestão inválida" }, 400)

  // Only the author of a still-pending suggestion may upload to it.
  const submission = await fetchSubmission(env, auth.token, id)
  if (
    !submission ||
    submission.user_id !== auth.userId ||
    submission.status !== "pending"
  ) {
    return json({ error: "Sem permissões nesta sugestão." }, 403)
  }

  const type = (request.headers.get("Content-Type") ?? "").split(";")[0]?.trim()
  if (type !== "image/jpeg") {
    return json({ error: "Tipo de imagem não suportado" }, 415)
  }
  if (Number(request.headers.get("Content-Length") || 0) > MAX_BYTES) {
    return json({ error: "Imagem demasiado grande." }, 413)
  }
  const buffer = await request.arrayBuffer()
  if (buffer.byteLength > MAX_BYTES) {
    return json({ error: "Imagem demasiado grande." }, 413)
  }

  await env.AVATAR_BUCKET!.put(pendingKey(id), buffer, {
    httpMetadata: { contentType: "image/jpeg" },
  })
  return json({ ok: true })
}
