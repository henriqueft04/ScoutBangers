import { createSign } from "node:crypto"
import { request } from "node:https"
import type { RequestOptions } from "node:https"

const SCOPE = "https://www.googleapis.com/auth/drive.readonly"
const TOKEN_HOST = "oauth2.googleapis.com"
const TOKEN_PATH = "/token"

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

function httpsPost(
  host: string,
  path: string,
  body: string,
  headers: Record<string, string>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const opts: RequestOptions = {
      host,
      path,
      method: "POST",
      headers: {
        ...headers,
        "Content-Length": Buffer.byteLength(body),
        Connection: "close",
      },
    }
    const req = request(opts, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (chunk: Buffer) => chunks.push(chunk))
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
      res.on("error", reject)
    })
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

/**
 * Fetch a Drive access token by signing a JWT with the service account's
 * private key and exchanging it at Google's token endpoint.
 *
 * Uses node:https directly (not fetch/undici) to avoid undici's HTTP/2
 * stream-termination issues that cause body reads to hang in Node 24.
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
      aud: `https://${TOKEN_HOST}${TOKEN_PATH}`,
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url")

  const signer = createSign("RSA-SHA256")
  signer.update(`${header}.${payload}`)
  const signature = signer.sign(private_key, "base64url")
  const jwt = `${header}.${payload}.${signature}`

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  }).toString()

  const responseText = await httpsPost(TOKEN_HOST, TOKEN_PATH, body, {
    "Content-Type": "application/x-www-form-urlencoded",
  })

  const data = JSON.parse(responseText) as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!data.access_token) {
    throw new Error(
      `Token exchange failed: ${data.error ?? ""} ${data.error_description ?? responseText}`.trim()
    )
  }
  return data.access_token
}
