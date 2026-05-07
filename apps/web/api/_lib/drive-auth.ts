import { createSign } from "node:crypto"

const SCOPE = "https://www.googleapis.com/auth/drive.readonly"
const TOKEN_URL = "https://oauth2.googleapis.com/token"

function getCredentials(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON env var is not set. Paste the full service-account JSON contents into it."
    )
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

/**
 * Fetch a Drive access token by manually signing a JWT with the service
 * account's private key and exchanging it at Google's token endpoint.
 *
 * Uses only Node's built-in `crypto` — no google-auth-library, no
 * persistent agents, no background timers. Safe for serverless: the
 * process exits cleanly as soon as the handler returns.
 */
export async function getDriveAccessToken(): Promise<string> {
  const { client_email, private_key } = getCredentials()

  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url")
  const payload = Buffer.from(
    JSON.stringify({
      iss: client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url")

  const signer = createSign("RSA-SHA256")
  signer.update(`${header}.${payload}`)
  const signature = signer.sign(private_key, "base64url")
  const jwt = `${header}.${payload}.${signature}`

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
  if (!data.access_token) {
    throw new Error(
      `Token exchange failed: ${data.error ?? ""} ${data.error_description ?? JSON.stringify(data)}`.trim()
    )
  }
  return data.access_token
}
