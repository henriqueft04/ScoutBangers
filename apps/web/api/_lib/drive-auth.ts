const SCOPE = "https://www.googleapis.com/auth/drive.readonly"
const TOKEN_URL = "https://oauth2.googleapis.com/token"

function getCredentials(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON env var is not set."
    )
  }
  let creds: { client_email?: string; private_key?: string }
  try {
    creds = JSON.parse(raw)
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON could not be parsed as JSON.")
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.")
  }
  return { client_email: creds.client_email, private_key: creds.private_key }
}

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "")
  const binary = atob(base64)
  const buf = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i)
  return buf
}

function strToBuffer(str: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(str)
  const buf = new ArrayBuffer(encoded.length)
  new Uint8Array(buf).set(encoded)
  return buf
}

function toBase64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

function jsonToBase64url(obj: unknown): string {
  return toBase64url(strToBuffer(JSON.stringify(obj)))
}

/**
 * Fetch a Drive access token using Web Crypto (works in both Edge and Node
 * runtimes). Signs a JWT with the service account's RSA private key and
 * exchanges it at Google's token endpoint via fetch.
 */
export async function getDriveAccessToken(): Promise<string> {
  const { client_email, private_key } = getCredentials()

  const keyDer = pemToDer(private_key)
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const now = Math.floor(Date.now() / 1000)
  const header = jsonToBase64url({ alg: "RS256", typ: "JWT" })
  const payload = jsonToBase64url({
    iss: client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })

  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    strToBuffer(`${header}.${payload}`)
  )
  const jwt = `${header}.${payload}.${toBase64url(sigBuf)}`

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  const data = (await res.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!data.access_token) {
    throw new Error(
      `Token exchange failed: ${data.error ?? ""} ${data.error_description ?? ""}`.trim()
    )
  }
  return data.access_token
}
