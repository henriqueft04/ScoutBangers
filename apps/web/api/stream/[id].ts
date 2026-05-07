/**
 * GET /api/stream/:id
 *
 * Streaming proxy for a single Drive audio file. Forwards the client's `Range`
 * header to Drive (which the browser blocks when called directly due to CORS),
 * pipes the response body through, and surfaces the upstream status code so
 * 206 Partial Content reaches the HTML5 audio element. This is what makes
 * seek-while-playing feel instant.
 *
 * Required env var:
 *   - DRIVE_API_KEY      Google Cloud API key with Drive API enabled
 */

export const config = { runtime: "edge" }

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
  const apiKey = process.env.DRIVE_API_KEY
  if (!apiKey) {
    return new Response("Server misconfigured: DRIVE_API_KEY is unset.", {
      status: 500,
    })
  }

  const url = new URL(request.url)
  const id = url.pathname.split("/").filter(Boolean).pop()
  if (!id) {
    return new Response("Missing file id", { status: 400 })
  }

  const driveUrl = `${DRIVE_FILE_URL}/${encodeURIComponent(
    id
  )}?alt=media&key=${apiKey}`

  const upstreamHeaders: Record<string, string> = {}
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

  // Surface non-success bodies as text so the client can debug. Drive returns
  // a virus-scan HTML page for files >100 MB — flag it as 502 so the player
  // shows an error instead of trying to play HTML.
  if (!upstream.ok) {
    const detail = await upstream.text()
    return new Response(
      `Drive returned ${upstream.status}: ${detail.slice(0, 500)}`,
      { status: 502 }
    )
  }

  // Even with status 200, Drive may return an HTML "scan virus" or "quota
  // exceeded" page for some files. The audio element treats HTML as a decode
  // error with no useful message — surface a real one here.
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
  // poison the cache for unrelated range requests (e.g., the metadata
  // prefetch's 0-524287 chunk being served as if it were the full file,
  // causing Chromium's FFmpegDemuxer to error out partway through playback).
  //
  // - Full responses (200): safe to cache on the CDN long-term, immutable
  //   because Drive file IDs are content-addressed.
  // - Partial responses (206): browser cache only (`private`); never cached
  //   on the shared CDN. `Vary: Range` is also set so any well-behaved
  //   intermediary keys correctly.
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
