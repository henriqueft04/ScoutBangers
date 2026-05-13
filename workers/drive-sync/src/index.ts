import { getDriveAccessToken } from "./drive-auth"

interface Env {
  AUDIO_BUCKET: R2Bucket
  DRIVE_FOLDER_ID: string
  GOOGLE_SERVICE_ACCOUNT_JSON: string
  SYNC_TOKEN: string
}

const DRIVE_LIST_URL = "https://www.googleapis.com/drive/v3/files"
const DRIVE_FILE_URL = "https://www.googleapis.com/drive/v3/files"

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

const PER_RUN_CAP = 20

async function listFolder(token: string, folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType contains 'audio/' and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
      pageSize: "1000",
    })
    if (pageToken) params.set("pageToken", pageToken)
    const res = await fetch(`${DRIVE_LIST_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new Error(`Drive list failed: ${res.status} ${await res.text()}`)
    }
    const data = (await res.json()) as DriveListResponse
    out.push(...data.files)
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

async function copyOne(env: Env, token: string, file: DriveFile): Promise<void> {
  const url = `${DRIVE_FILE_URL}/${encodeURIComponent(file.id)}?alt=media&acknowledgeAbuse=true`
  const upstream = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!upstream.ok || !upstream.body) {
    throw new Error(`Drive download failed for ${file.id}: ${upstream.status}`)
  }
  const contentType = upstream.headers.get("content-type") ?? file.mimeType
  await env.AUDIO_BUCKET.put(file.id, upstream.body, {
    httpMetadata: { contentType },
    customMetadata: {
      driveName: file.name,
      driveModifiedTime: file.modifiedTime,
    },
  })
}

interface SyncResult {
  scanned: number
  copied: string[]
  skipped: number
  errors: Array<{ id: string; name: string; error: string }>
  remaining: number
}

async function runSync(env: Env): Promise<SyncResult> {
  const token = await getDriveAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const files = await listFolder(token, env.DRIVE_FOLDER_ID)

  const result: SyncResult = {
    scanned: files.length,
    copied: [],
    skipped: 0,
    errors: [],
    remaining: 0,
  }

  for (const file of files) {
    if (result.copied.length >= PER_RUN_CAP) {
      result.remaining += 1
      continue
    }
    const existing = await env.AUDIO_BUCKET.head(file.id)
    if (existing) {
      // Re-sync if Drive has a newer version. We tagged the existing
      // object with `driveModifiedTime` when we last copied it; if
      // Drive's current modifiedTime differs, the file's bytes have
      // changed (new tags, embedded thumbnail, re-encoded audio, etc.)
      // and we need to overwrite. Without this check, edits made on
      // Drive after the first sync were silently invisible to the app.
      const cachedMtime = existing.customMetadata?.driveModifiedTime
      if (cachedMtime === file.modifiedTime) {
        result.skipped += 1
        continue
      }
    }
    try {
      await copyOne(env, token, file)
      result.copied.push(file.name)
    } catch (error) {
      result.errors.push({
        id: file.id,
        name: file.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runSync(env).then((r) => {
        console.log("sync result", JSON.stringify(r))
      })
    )
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const token = url.searchParams.get("token")
    if (!env.SYNC_TOKEN || token !== env.SYNC_TOKEN) {
      return new Response("Unauthorized", { status: 401 })
    }
    try {
      const result = await runSync(env)
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" },
      })
    } catch (error) {
      return new Response(
        `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
        { status: 500 }
      )
    }
  },
}
