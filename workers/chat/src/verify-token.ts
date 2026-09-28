export interface VerifiedUser {
  id: string
}

interface Jwk extends JsonWebKey {
  kid?: string
}

const jwksCache = new Map<string, CryptoKey>()
let cachedJwksUrl: string | null = null

function base64urlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  )
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodeJsonPart(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64urlToBytes(part)))
}

async function getSigningKey(
  supabaseUrl: string,
  kid: string
): Promise<CryptoKey | null> {
  const cached = jwksCache.get(kid)
  if (cached) return cached

  const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`
  if (jwksUrl !== cachedJwksUrl) {
    jwksCache.clear()
    cachedJwksUrl = jwksUrl
  }

  const res = await fetch(jwksUrl)
  if (!res.ok) return null
  const { keys } = (await res.json()) as { keys: Jwk[] }
  const jwk = keys.find((k) => k.kid === kid)
  if (!jwk) return null

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  )
  jwksCache.set(kid, key)
  return key
}

/**
 * Verifies a Supabase access token entirely with Web Crypto — no JWT
 * library, no Postgres/Auth-server round trip on the hot path. Mirrors
 * workers/drive-sync/src/drive-auth.ts, which signs its own service-account
 * JWT the same way (crypto.subtle, no external dependency). The JWKS
 * response is cached in memory per `kid` and only re-fetched for a `kid`
 * not seen yet (e.g. after a Supabase signing-key rotation).
 *
 * Assumes this Supabase project uses the current default JWT Signing Keys
 * (ES256, exposed via .well-known/jwks.json — Settings -> API -> JWT Keys
 * in the Supabase dashboard). If this project still uses the legacy shared
 * HS256 secret instead, tokens will have `alg: "HS256"` and this needs an
 * HMAC-SHA256 verification path added alongside this one.
 */
export async function verifySupabaseToken(
  token: string,
  supabaseUrl: string
): Promise<VerifiedUser | null> {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [headerPart, payloadPart, signaturePart] = parts

  try {
    const header = decodeJsonPart(headerPart) as { kid?: string; alg?: string }
    if (header.alg !== "ES256" || !header.kid) return null

    const key = await getSigningKey(supabaseUrl, header.kid)
    if (!key) return null

    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64urlToBytes(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`)
    )
    if (!valid) return null

    const payload = decodeJsonPart(payloadPart) as {
      sub?: string
      exp?: number
      iss?: string
    }
    if (typeof payload.sub !== "string") return null
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now())
      return null
    if (payload.iss !== `${supabaseUrl}/auth/v1`) return null

    return { id: payload.sub }
  } catch {
    return null
  }
}
