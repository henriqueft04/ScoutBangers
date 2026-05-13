/**
 * Supabase JWT verification for Pages Functions. Handles both the
 * legacy HS256 shared-secret flow (`SUPABASE_JWT_SECRET`) and the
 * current asymmetric signing keys flow (RS256 / ES256 via JWKS at
 * `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`). Picks the path
 * based on the token's `alg` header.
 */

export interface JwtEnv {
  SUPABASE_JWT_SECRET?: string
  SUPABASE_URL?: string
}

interface JwtHeader {
  alg: string
  kid?: string
}

interface JwtPayload {
  sub?: string
  email?: string
  exp?: number
}

export interface VerifiedJwt {
  sub: string
  email: string | null
}

export type VerifyResult =
  | ({ ok: true } & VerifiedJwt)
  | { ok: false; reason: string }

let jwksCache: { fetchedAt: number; keys: JsonWebKey[] } | null = null
const JWKS_TTL_MS = 60 * 60 * 1000

function b64urlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return buf
}

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

export async function verifyJwt(
  token: string,
  env: JwtEnv
): Promise<VerifyResult> {
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
      if (jwks.length === 0) return { ok: false, reason: "JWKS empty" }
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
  if (!signatureValid)
    return { ok: false, reason: `bad signature (alg=${header.alg})` }

  let payload: JwtPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)))
  } catch {
    return { ok: false, reason: "bad payload" }
  }
  if (!payload.sub) return { ok: false, reason: "no sub" }
  if (payload.exp && payload.exp * 1000 < Date.now())
    return { ok: false, reason: "expired" }
  return { ok: true, sub: payload.sub, email: payload.email ?? null }
}

/** Extracts the Bearer token from an Authorization header. */
export function bearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization")
  if (!auth?.startsWith("Bearer ")) return null
  return auth.slice("Bearer ".length).trim()
}
