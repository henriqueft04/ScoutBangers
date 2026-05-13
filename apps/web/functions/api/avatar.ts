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
  /** Legacy HS256 secret. Optional once a project moves to asymmetric keys. */
  SUPABASE_JWT_SECRET?: string
  /** Supabase project URL, e.g. https://abc123.supabase.co. Used to fetch
   *  the JWKS for RS256/ES256 verification. */
  SUPABASE_URL?: string
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
  // Need either the legacy HS256 secret or the project URL for JWKS.
  const hasAuthConfig = Boolean(env.SUPABASE_JWT_SECRET || env.SUPABASE_URL)
  if (!env.AVATAR_BUCKET || !hasAuthConfig || !env.AVATAR_PUBLIC_BASE_URL) {
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

interface JwtHeader {
  alg: string
  kid?: string
}

interface JwtPayload {
  sub?: string
  exp?: number
}

let jwksCache: { fetchedAt: number; keys: JsonWebKey[] } | null = null
const JWKS_TTL_MS = 60 * 60 * 1000 // 1h

async function getJwks(supabaseUrl: string): Promise<JsonWebKey[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys
  }
  const base = supabaseUrl.replace(/\/+$/, "")
  const res = await fetch(`${base}/auth/v1/.well-known/jwks.json`)
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)
  const body = (await res.json()) as { keys: JsonWebKey[] }
  jwksCache = { fetchedAt: Date.now(), keys: body.keys ?? [] }
  return jwksCache.keys
}

function bufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  // Web Crypto wants a plain ArrayBuffer (not SharedArrayBuffer-typed).
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return buf
}

type VerifyResult =
  | { ok: true; sub: string }
  | { ok: false; reason: string }

async function verifyJwt(token: string, env: Env): Promise<VerifyResult> {
  const parts = token.split(".")
  if (parts.length !== 3) return { ok: false, reason: "malformed token" }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

  let header: JwtHeader
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64)))
  } catch {
    return { ok: false, reason: "bad header" }
  }

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const signature = bufferFromBytes(b64urlToBytes(signatureB64))

  let signatureValid = false
  try {
    if (header.alg === "HS256") {
      if (!env.SUPABASE_JWT_SECRET)
        return { ok: false, reason: "HS256 token but SUPABASE_JWT_SECRET unset" }
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.SUPABASE_JWT_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      )
      signatureValid = await crypto.subtle.verify("HMAC", key, signature, data)
    } else if (header.alg === "RS256" || header.alg === "ES256") {
      if (!env.SUPABASE_URL)
        return { ok: false, reason: `${header.alg} token but SUPABASE_URL unset` }
      const jwks = await getJwks(env.SUPABASE_URL)
      if (jwks.length === 0)
        return { ok: false, reason: "JWKS empty" }
      const match =
        jwks.find((k) => (k as { kid?: string }).kid === header.kid) ?? jwks[0]
      if (!match)
        return { ok: false, reason: `no JWKS key for kid=${header.kid}` }
      const algParams: RsaHashedImportParams | EcKeyImportParams =
        header.alg === "RS256"
          ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
          : { name: "ECDSA", namedCurve: "P-256" }
      const key = await crypto.subtle.importKey(
        "jwk",
        match,
        algParams,
        false,
        ["verify"]
      )
      const verifyParams =
        header.alg === "RS256"
          ? "RSASSA-PKCS1-v1_5"
          : { name: "ECDSA", hash: "SHA-256" }
      signatureValid = await crypto.subtle.verify(
        verifyParams,
        key,
        signature,
        data
      )
    } else {
      return { ok: false, reason: `unsupported alg ${header.alg}` }
    }
  } catch (err) {
    return {
      ok: false,
      reason: `crypto error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (!signatureValid) return { ok: false, reason: `bad signature (alg=${header.alg})` }

  let payload: JwtPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)))
  } catch {
    return { ok: false, reason: "bad payload" }
  }
  if (!payload.sub) return { ok: false, reason: "no sub" }
  if (payload.exp && payload.exp * 1000 < Date.now())
    return { ok: false, reason: "expired" }
  return { ok: true, sub: payload.sub }
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
  const result = await verifyJwt(token, env)
  if (!result.ok) {
    return json({ error: `Token inválido: ${result.reason}` }, 401)
  }
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
