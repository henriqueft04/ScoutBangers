/**
 * Avatar upload endpoint. Stores user-uploaded profile pictures in the
 * `scoutbangers-avatars` R2 bucket and returns the public URL so the
 * caller can persist it on the Supabase `profiles.avatar_url` column.
 *
 * Auth: the client sends its Supabase access token in `Authorization:
 * Bearer <jwt>`. We verify the JWT signature against SUPABASE_JWT_SECRET
 * (HS256) and use the `sub` claim as the canonical user id — never
 * trust a user-supplied id field. This means a malicious client cannot
 * overwrite someone else's avatar.
 *
 * Sizing: the browser resizes to ~256×256 JPEG before upload. We hard-
 * cap at 1 MB just so a buggy/hostile client can't pour a multi-MB
 * file into R2.
 */

interface Env {
  AVATAR_BUCKET: R2Bucket
  SUPABASE_JWT_SECRET: string
  AVATAR_PUBLIC_BASE_URL: string
}

// Avatars are tight (256² JPEG); banners are wider so we allow a
// larger payload. Both are still well under R2's per-object limits and
// the client resizes before sending — these caps are just a guard
// against a hostile/buggy uploader.
const MAX_BYTES_AVATAR = 1_000_000
const MAX_BYTES_BANNER = 2_500_000
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

type Kind = "avatar" | "banner"

function kindFromRequest(request: Request): Kind {
  const url = new URL(request.url)
  return url.searchParams.get("kind") === "banner" ? "banner" : "avatar"
}

function maxBytesFor(kind: Kind): number {
  return kind === "banner" ? MAX_BYTES_BANNER : MAX_BYTES_AVATAR
}

function keyPrefixFor(kind: Kind): string {
  return kind === "banner" ? "banner" : "avatar"
}

/**
 * In `npm run dev` we don't have the Pages bindings (R2, secrets), so
 * the function would crash on first touch. Return a clear 503 instead
 * so the caller sees a useful message and can move testing to a
 * preview deploy.
 */
function checkConfig(env: Env): Response | null {
  if (!env.AVATAR_BUCKET || !env.SUPABASE_JWT_SECRET || !env.AVATAR_PUBLIC_BASE_URL) {
    return json(
      {
        error:
          "Carregamento de imagens não disponível em desenvolvimento (faltam bindings R2 / secrets). Testa num preview deploy.",
      },
      503
    )
  }
  return null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
}

async function verifyJwt(
  token: string,
  secret: string
): Promise<{ sub: string } | null> {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const signature = b64urlToBytes(signatureB64)
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  )
  // Copy into a fresh ArrayBuffer to satisfy Web Crypto's BufferSource
  // signature (the source Uint8Array can have a SharedArrayBuffer-typed
  // .buffer in some TS lib configs).
  const sigBuffer = new ArrayBuffer(signature.byteLength)
  new Uint8Array(sigBuffer).set(signature)
  const ok = await crypto.subtle.verify("HMAC", key, sigBuffer, data)
  if (!ok) return null

  const payloadJson = new TextDecoder().decode(b64urlToBytes(payloadB64))
  let payload: { sub?: string; exp?: number }
  try {
    payload = JSON.parse(payloadJson)
  } catch {
    return null
  }
  if (!payload.sub) return null
  if (payload.exp && payload.exp * 1000 < Date.now()) return null
  return { sub: payload.sub }
}

function b64urlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function authenticate(
  request: Request,
  env: Env
): Promise<{ userId: string } | Response> {
  const auth = request.headers.get("Authorization")
  if (!auth?.startsWith("Bearer ")) {
    return json({ error: "Não autenticado" }, 401)
  }
  const token = auth.slice("Bearer ".length).trim()
  const result = await verifyJwt(token, env.SUPABASE_JWT_SECRET)
  if (!result) return json({ error: "Token inválido" }, 401)
  return { userId: result.sub }
}

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png"
  if (contentType === "image/webp") return "webp"
  return "jpg"
}

function objectKey(kind: Kind, userId: string, ext: string): string {
  return `${keyPrefixFor(kind)}-${userId}.${ext}`
}

function publicUrl(env: Env, key: string): string {
  const base = env.AVATAR_PUBLIC_BASE_URL.replace(/\/+$/, "")
  return `${base}/${key}`
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const configError = checkConfig(env)
  if (configError) return configError
  const auth = await authenticate(request, env)
  if (auth instanceof Response) return auth
  const kind = kindFromRequest(request)
  const maxBytes = maxBytesFor(kind)

  const contentType = (request.headers.get("Content-Type") || "").toLowerCase()
  const baseType = contentType.split(";")[0]?.trim() ?? ""
  if (!ALLOWED_TYPES.has(baseType)) {
    return json({ error: "Tipo de imagem não suportado" }, 415)
  }

  const length = Number(request.headers.get("Content-Length") || 0)
  if (length > maxBytes) {
    return json({ error: "Imagem demasiado grande." }, 413)
  }

  const buffer = await request.arrayBuffer()
  if (buffer.byteLength > maxBytes) {
    return json({ error: "Imagem demasiado grande." }, 413)
  }

  const ext = extensionFor(baseType)
  const key = objectKey(kind, auth.userId, ext)
  // Bust other extensions so a user switching from PNG → JPG doesn't
  // leave a stale file orphaned in the bucket.
  for (const otherExt of ["jpg", "png", "webp"]) {
    if (otherExt !== ext) {
      await env.AVATAR_BUCKET.delete(
        objectKey(kind, auth.userId, otherExt)
      ).catch(() => undefined)
    }
  }

  await env.AVATAR_BUCKET.put(key, buffer, {
    httpMetadata: {
      contentType: baseType,
      cacheControl: "public, max-age=31536000, immutable",
    },
  })

  // Add a short query string so clients picking up the URL get the
  // fresh image instead of a cached old one.
  const url = `${publicUrl(env, key)}?v=${Date.now()}`
  return json({ url })
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const configError = checkConfig(env)
  if (configError) return configError
  const auth = await authenticate(request, env)
  if (auth instanceof Response) return auth
  const kind = kindFromRequest(request)

  for (const ext of ["jpg", "png", "webp"]) {
    await env.AVATAR_BUCKET.delete(objectKey(kind, auth.userId, ext)).catch(
      () => undefined
    )
  }
  return json({ ok: true })
}
