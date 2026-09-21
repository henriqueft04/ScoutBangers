const SCOPE = "https://www.googleapis.com/auth/drive"
const TOKEN_URL = "https://oauth2.googleapis.com/token"

interface ServiceAccountCreds {
  client_email: string
  private_key: string
}

export function parseServiceAccount(raw: string | undefined): ServiceAccountCreds {
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var is not set.")
  }
  let creds: { client_email?: string; private_key?: string }
  try {
    creds = JSON.parse(raw)
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON could not be parsed as JSON.")
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key."
    )
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

export async function getDriveAccessToken(env: any): Promise<string> {
  if (env.GOOGLE_REFRESH_TOKEN && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token"
      })
    })
    const data = await res.json() as any
    if (data.access_token) return data.access_token
    throw new Error("Failed to get access token from refresh token: " + JSON.stringify(data))
  }

  const { client_email, private_key } = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON)

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )

  // Fetch real time from Google to avoid local clock skew issues
  const dateRes = await fetch("https://www.googleapis.com", { method: "HEAD" }).catch(() => null);
  const serverDate = dateRes?.headers.get("date");
  const now = serverDate ? Math.floor(new Date(serverDate).getTime() / 1000) : Math.floor(Date.now() / 1000);

  const header = jsonToBase64url({ alg: "RS256", typ: "JWT" })
  const payload = jsonToBase64url({
    iss: client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now - 60, // 60s buffer
    exp: now + 3540,
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
