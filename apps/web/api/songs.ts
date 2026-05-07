import { request } from "node:https"
import type { RequestOptions } from "node:https"
import { getDriveAccessToken } from "./_lib/drive-auth.js"

/**
 * GET /api/songs
 *
 * Lists every audio file in the Drive folder identified by DRIVE_FOLDER_ID.
 * Uses node:https (not fetch/undici) to avoid undici HTTP/2 body-read hangs.
 */

const DRIVE_LIST_HOST = "www.googleapis.com"
const DRIVE_LIST_PATH = "/drive/v3/files"

interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime: string
}

interface DriveListResponse {
  files: DriveFile[]
  nextPageToken?: string
}

interface Song {
  id: string
  title: string
  artist?: string
  mimeType: string
  size: number
  modifiedTime: string
}

function httpsGet(path: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const opts: RequestOptions = {
      host: DRIVE_LIST_HOST,
      path,
      method: "GET",
      headers: { ...headers, Connection: "close" },
    }
    const req = request(opts, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (chunk: Buffer) => chunks.push(chunk))
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
      res.on("error", reject)
    })
    req.on("error", reject)
    req.end()
  })
}

function parseSongName(filename: string): { title: string; artist?: string } {
  const withoutExt = filename.replace(/\.[a-z0-9]+$/i, "")
  const match = withoutExt.match(/^(.+?)\s*[-–—]\s*(.+)$/)
  if (match) {
    return { artist: match[1]!.trim(), title: match[2]!.trim() }
  }
  return { title: withoutExt.trim() }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init.headers,
    },
  })
}

export default async function handler(request: Request): Promise<Response> {
  const folderId = process.env.DRIVE_FOLDER_ID
  if (!folderId) {
    return jsonResponse(
      { error: "Server misconfigured: DRIVE_FOLDER_ID is unset." },
      { status: 500 }
    )
  }

  let token: string
  try {
    token = await getDriveAccessToken()
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to obtain Drive access token",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }

  const bust = request.url.includes("bust")
  const files: DriveFile[] = []
  let pageToken: string | undefined

  try {
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and mimeType contains 'audio/' and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
        pageSize: "1000",
      })
      if (pageToken) params.set("pageToken", pageToken)

      const responseText = await httpsGet(
        `${DRIVE_LIST_PATH}?${params}`,
        { Authorization: `Bearer ${token}` }
      )
      const data = JSON.parse(responseText) as DriveListResponse
      if (!Array.isArray(data.files)) {
        return jsonResponse(
          { error: "Unexpected Drive API response", detail: responseText.slice(0, 500) },
          { status: 502 }
        )
      }
      files.push(...data.files)
      pageToken = data.nextPageToken
    } while (pageToken)
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to reach Drive API",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    )
  }

  const songs: Song[] = files
    .map((file) => {
      const { title, artist } = parseSongName(file.name)
      return {
        id: file.id,
        title,
        artist,
        mimeType: file.mimeType,
        size: file.size ? Number.parseInt(file.size, 10) : 0,
        modifiedTime: file.modifiedTime,
      }
    })
    .sort((a, b) => {
      const aKey = `${a.artist ?? ""} ${a.title}`.toLowerCase()
      const bKey = `${b.artist ?? ""} ${b.title}`.toLowerCase()
      return aKey.localeCompare(bKey)
    })

  return jsonResponse(songs, {
    headers: bust
      ? { "Cache-Control": "no-store" }
      : { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  })
}
