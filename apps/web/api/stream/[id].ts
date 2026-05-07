import { getDriveAccessToken } from "../_lib/drive-auth.js"
import { listFolderFileIds } from "../_lib/folder-files.js"

export const config = { runtime: "edge" }

/**
 * GET /api/stream/:id — Edge function
 *
 * Streaming proxy for a single Drive audio file. Forwards the client's
 * Range header to Drive and pipes the response body through.
 *
 * Validates the requested id against an allowlist of files actually in
 * the configured folder so the endpoint can't be abused to proxy
 * arbitrary Drive files. Allowlist is cached for 5 minutes per folder.
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
  const folderId = process.env.DRIVE_FOLDER_ID
  if (!folderId) {
    return new Response("Server misconfigured: DRIVE_FOLDER_ID is unset.", {
      status: 500,
    })
  }

  let token: string
  try {
    token = await getDriveAccessToken()
  } catch (error) {
    return new Response(
      `Server misconfigured: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 }
    )
  }

  const id = request.url.split("?")[0].split("/").filter(Boolean).pop()
  if (!id) return new Response("Missing file id", { status: 400 })

  // Allowlist check: only stream files that are actually in the folder.
  // Fail closed on Drive errors — better to return a transient error than
  // proxy an unverified file.
  let allowedIds: Set<string>
  try {
    allowedIds = await listFolderFileIds(token, folderId)
  } catch (error) {
    return new Response(
      `Couldn't verify file: ${error instanceof Error ? error.message : String(error)}`,
      { status: 502 }
    )
  }
  if (!allowedIds.has(id)) {
    return new Response("Not found", { status: 404 })
  }

  const driveUrl = `${DRIVE_FILE_URL}/${encodeURIComponent(id)}?alt=media`

  const upstreamHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }
  const range = request.headers.get("range")
  if (range) upstreamHeaders["range"] = range

  let upstream: Response
  try {
    upstream = await fetch(driveUrl, { headers: upstreamHeaders })
  } catch (error) {
    return new Response(
      `Upstream fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      { status: 502 }
    )
  }

  if (!upstream.ok) {
    const detail = await upstream.text()
    return new Response(`Drive returned ${upstream.status}: ${detail.slice(0, 500)}`, { status: 502 })
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

  if (upstream.status === 206) {
    responseHeaders.set("Cache-Control", "private, max-age=3600")
  } else {
    responseHeaders.set("Cache-Control", "public, max-age=86400, immutable")
  }
  responseHeaders.set("Vary", "Range")

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}
