import { JWT } from "google-auth-library"

/**
 * Drive auth helper using a service account.
 *
 * The service account's JSON credentials are pasted whole into the
 * `GOOGLE_SERVICE_ACCOUNT_JSON` env var. We instantiate a `JWT` client once
 * per Node process — `google-auth-library` then handles token fetch + caching
 * (≈1 hour validity, refreshed transparently) for every subsequent call.
 *
 * Returned token goes into an `Authorization: Bearer <token>` header on
 * Drive API requests, replacing the old `?key=...` API-key query param. This
 * authenticates as the service account itself (which has been granted
 * Viewer access to the music folder), so we get authenticated quotas and
 * stop hitting Google's IP-level abuse detector.
 */

const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

let client: JWT | null = null

function getClient(): JWT {
  if (client) return client
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON env var is not set. Paste the full service-account JSON contents into it."
    )
  }
  let credentials: { client_email?: string; private_key?: string }
  try {
    credentials = JSON.parse(raw)
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON could not be parsed as JSON."
    )
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key."
    )
  }
  client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: SCOPES,
  })
  return client
}

/** Fetch a current Drive access token. Cached internally by the JWT client. */
export async function getDriveAccessToken(): Promise<string> {
  const auth = getClient()
  const { token } = await auth.getAccessToken()
  if (!token) {
    throw new Error("Empty access token from Google token endpoint")
  }
  return token
}
