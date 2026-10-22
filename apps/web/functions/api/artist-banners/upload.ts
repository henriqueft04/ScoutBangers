import { json } from "../_lib/http"
import {
  authenticate,
  checkBannerConfig,
  fetchSubmission,
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

  // JPEG files start FF D8 FF; the Content-Type header alone proves nothing.
  const head = new Uint8Array(buffer, 0, Math.min(3, buffer.byteLength))
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
    return json({ error: "A imagem não é um JPEG válido." }, 415)
  }
  // A suggestion's image is set once: an admin approves what they looked at.
  if (await env.AVATAR_BUCKET!.head(pendingKey(id))) {
    return json({ error: "Esta sugestão já tem imagem." }, 409)
  }

  await env.AVATAR_BUCKET!.put(pendingKey(id), buffer, {
    httpMetadata: { contentType: "image/jpeg" },
  })
  return json({ ok: true })
}
