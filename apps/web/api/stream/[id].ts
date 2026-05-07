// `.js` extension is required by Vercel's nodenext module resolution even
// though the source is .ts — the extension refers to the compiled output.
import { getDriveAccessToken } from "../_lib/drive-auth.js"

/**
 * GET /api/stream/:id
 *
 * Streaming proxy for a single Drive audio file. Forwards the client's `Range`
 * header to Drive (which the browser blocks when called directly due to CORS),
 * pipes the response body through, and surfaces the upstream status code so
 * 206 Partial Content reaches the HTML5 audio element.
 *
 * Authenticated as a Google service account — see `_lib/drive-auth.ts`.
 */

const DRIVE_FILE_URL = "https://www.googleapis.com/drive/v3/files"

const FORWARDED_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
] as const

export default async function handler(request: Request): Promise<Response> {
  let token: string
  try {
    token = await getDriveAccessToken()
  } catch (error) {
    return new Response(
      `Server misconfigured: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 }
    )
  }

  const url = new URL(request.url)
  const id = url.pathname.split("/").filter(Boolean).pop()
  if (!id) {
    return new Response("Missing file id", { status: 400 })
  }

  const driveUrl = `${DRIVE_FILE_URL}/${encodeURIComponent(id)}?alt=media`

  const upstreamHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }
  const range = request.headers.get("range")
  if (range) upstreamHeaders["range"] = range

  let upstream: Response
  try {
    upstream = await fetch(driveUrl, {
      headers: upstreamHeaders,
      method: "GET",
    })
  } catch (error) {
    return new Response(
      `Upstream fetch failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { status: 502 }
    )
  }

  if (!upstream.ok) {
    const detail = await upstream.text()
    return new Response(
      `Drive returned ${upstream.status}: ${detail.slice(0, 500)}`,
      { status: 502 }
    )
  }

  const upstreamType = upstream.headers.get("content-type") ?? ""
  if (
    !upstreamType.startsWith("audio/") &&
    !upstreamType.startsWith("video/") &&
    upstreamType !== "application/octet-stream"
  ) {
    const detail = await upstream.text()
    return new Response(
      `Drive returned non-audio content (${upstreamType}). Snippet: ${detail.slice(0, 400)}`,
      { status: 502 }
    )
  }

  const responseHeaders = new Headers()
  for (const header of FORWARDED_HEADERS) {
    const value = upstream.headers.get(header)
    if (value) responseHeaders.set(header, value)
  }

  // Caching strategy is Range-aware. Vercel's edge CDN keys on the URL but
  // does NOT differentiate by Range header — caching a 206 response would
  // poison the cache for unrelated range requests.
  if (upstream.status === 206) {
    responseHeaders.set("Cache-Control", "private, max-age=3600")
  } else {
    responseHeaders.set(
      "Cache-Control",
      "public, max-age=86400, immutable"
    )
  }
  responseHeaders.set("Vary", "Range")

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}
