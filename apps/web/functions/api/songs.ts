import { getDriveAccessToken } from "./_lib/drive-auth"

interface Env {
  DRIVE_FOLDER_ID: string
  GOOGLE_SERVICE_ACCOUNT_JSON: string
}

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

function parseSongName(filename: string): { title: string; artist?: string } {
  return { title: filename.replace(/\.[a-z0-9]+$/i, "").trim() }
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
  })
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DRIVE_FOLDER_ID) {
    return json({ error: "Server misconfigured: DRIVE_FOLDER_ID is unset." }, 500)
  }

  let token: string
  try {
    token = await getDriveAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON)
  } catch (error) {
    return json(
      {
        error: "Failed to obtain Drive access token",
        detail: error instanceof Error ? error.message : String(error),
      },
      500
    )
  }

  const bust = request.url.includes("bust")
  const files: DriveFile[] = []
  let pageToken: string | undefined

  try {
    do {
      const params = new URLSearchParams({
        q: `'${env.DRIVE_FOLDER_ID}' in parents and mimeType contains 'audio/' and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
        pageSize: "1000",
      })
      if (pageToken) params.set("pageToken", pageToken)

      const res = await fetch(`${DRIVE_LIST_URL}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const detail = await res.text()
        return json(
          { error: "Drive API request failed", status: res.status, detail },
          502
        )
      }
      const data = (await res.json()) as DriveListResponse
      files.push(...data.files)
      pageToken = data.nextPageToken
    } while (pageToken)
  } catch (error) {
    return json(
      {
        error: "Failed to reach Drive API",
        detail: error instanceof Error ? error.message : String(error),
      },
      502
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

  return json(songs, 200, {
    "Cache-Control": bust
      ? "no-store"
      : "public, s-maxage=300, stale-while-revalidate=600",
  })
}
