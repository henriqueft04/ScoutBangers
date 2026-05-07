/**
 * GET /api/songs
 *
 * Lists every audio file in the Drive folder identified by DRIVE_FOLDER_ID and
 * returns a sorted manifest. Server-side so the API key never reaches the
 * client. Cached for 5 minutes on the Vercel edge with stale-while-revalidate
 * so weekly Drive uploads propagate without hammering the Drive API.
 *
 * Required env vars:
 *   - DRIVE_API_KEY       Google Cloud API key with Drive API enabled
 *   - DRIVE_FOLDER_ID     ID of a publicly-shared Drive folder
 */

export const config = { runtime: "edge" }

const DRIVE_LIST_URL = "https://www.googleapis.com/drive/v3/files"

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

function parseSongName(filename: string): {
  title: string
  artist?: string
} {
  const withoutExt = filename.replace(/\.[a-z0-9]+$/i, "")
  const match = withoutExt.match(/^(.+?)\s*[-–—]\s*(.+)$/)
  if (match) {
    return { artist: match[1]!.trim(), title: match[2]!.trim() }
  }
  return { title: withoutExt.trim() }
}

function jsonResponse(
  body: unknown,
  init: ResponseInit = {}
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init.headers,
    },
  })
}

export default async function handler(request: Request): Promise<Response> {
  const apiKey = process.env.DRIVE_API_KEY
  const folderId = process.env.DRIVE_FOLDER_ID

  if (!apiKey || !folderId) {
    return jsonResponse(
      { error: "Server misconfigured: DRIVE_API_KEY or DRIVE_FOLDER_ID is unset." },
      { status: 500 }
    )
  }

  // Allow the client to bust the edge cache with ?bust=...
  const bust = new URL(request.url).searchParams.has("bust")

  const files: DriveFile[] = []
  let pageToken: string | undefined

  try {
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and mimeType contains 'audio/' and trashed = false`,
        fields:
          "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
        pageSize: "1000",
        key: apiKey,
      })
      if (pageToken) params.set("pageToken", pageToken)

      const driveResponse = await fetch(`${DRIVE_LIST_URL}?${params}`)
      if (!driveResponse.ok) {
        const detail = await driveResponse.text()
        return jsonResponse(
          { error: "Drive API request failed", status: driveResponse.status, detail },
          { status: 502 }
        )
      }
      const data = (await driveResponse.json()) as DriveListResponse
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
      : {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=600",
        },
  })
}
