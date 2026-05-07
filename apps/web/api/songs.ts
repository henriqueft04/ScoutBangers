import { getDriveAccessToken } from "./_lib/drive-auth"

/**
 * GET /api/songs
 *
 * Lists every audio file in the Drive folder identified by DRIVE_FOLDER_ID and
 * returns a sorted manifest. Authenticated as a Google service account so we
 * get proper authenticated quotas (no more IP-level abuse-detection hits) and
 * the folder can stay private — share it with the service-account email
 * instead of "anyone with link".
 *
 * Required env vars:
 *   - GOOGLE_SERVICE_ACCOUNT_JSON  Full service-account JSON pasted whole
 *   - DRIVE_FOLDER_ID              ID of the Drive folder shared with the SA
 */

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
      })
      if (pageToken) params.set("pageToken", pageToken)

      const driveResponse = await fetch(`${DRIVE_LIST_URL}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!driveResponse.ok) {
        const detail = await driveResponse.text()
        return jsonResponse(
          {
            error: "Drive API request failed",
            status: driveResponse.status,
            detail,
          },
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
