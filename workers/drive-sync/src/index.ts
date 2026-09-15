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

/**
 * Canonical Content-Type per file extension, for the audio formats we
 * actually expect. Extension is the most reliable signal we have:
 *  - Drive's `alt=media` download response Content-Type header is
 *    unreliable — it sometimes serves `application/octet-stream`
 *    for a file whose Drive-listed mimeType is perfectly correct.
 *  - `file.mimeType` (from `files.list`) is usually right, but can
 *    also be whatever the uploading client happened to set.
 * Both of those get baked into the R2 object's Content-Type header
 * forever (until re-synced), and Safari/WebKit trusts a Blob's
 * declared type strictly when deciding whether it can play a
 * downloaded (cached) song — an incorrect type manifests as "formato
 * não suportado" even though the very same bytes stream fine directly
 * from R2 (where browsers are more willing to sniff). Extension is
 * deterministic and immune to both upstream quirks.
 */
const EXTENSION_CONTENT_TYPE: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  m4b: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
  weba: "audio/webm",
}

function resolveContentType(
  file: DriveFile,
  upstreamContentType: string | null
): string {
  const ext = file.name.split(".").pop()?.toLowerCase()
  if (ext && EXTENSION_CONTENT_TYPE[ext]) {
    return EXTENSION_CONTENT_TYPE[ext]
  }
  return file.mimeType || upstreamContentType || "application/octet-stream"
}

/**
 * Bumped whenever `resolveContentType` changes in a way that could fix
 * previously-mis-typed objects. Stored as R2 customMetadata alongside
 * `driveModifiedTime`; the skip-check in `runSync` requires BOTH to
 * match, so bumping this forces every existing object to be silently
 * re-copied (paced by PER_RUN_CAP across the 15-min cron) even though
 * Drive's own modifiedTime hasn't changed — a self-healing backfill
 * that needs no manual/admin action.
 */
const CONTENT_TYPE_VERSION = "2"

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
  const contentType = resolveContentType(file, upstream.headers.get("content-type"))
  await env.AUDIO_BUCKET.put(file.id, upstream.body, {
    httpMetadata: { contentType },
    customMetadata: {
      driveName: file.name,
      driveModifiedTime: file.modifiedTime,
      contentTypeVersion: CONTENT_TYPE_VERSION,
    },
  })
}

interface DebugRow {
  name: string
  driveMtime: string
  r2Mtime: string | undefined
  decision: "copy" | "skip" | "new"
}

interface SyncResult {
  scanned: number
  copied: string[]
  skipped: number
  errors: Array<{ id: string; name: string; error: string }>
  remaining: number
  /** Filled only when debug=1. First N rows of the comparison so we can
   *  confirm modifiedTime is actually changing. */
  debug?: DebugRow[]
}

async function runSync(env: Env, debug = false): Promise<SyncResult> {
  const token = await getDriveAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const files = await listFolder(token, env.DRIVE_FOLDER_ID)

  const result: SyncResult = {
    scanned: files.length,
    copied: [],
    skipped: 0,
    errors: [],
    remaining: 0,
  }
  if (debug) result.debug = []

  for (const file of files) {
    if (result.copied.length >= PER_RUN_CAP) {
      result.remaining += 1
      continue
    }
    const existing = await env.AUDIO_BUCKET.head(file.id)
    let decision: "copy" | "skip" | "new" = "new"
    let cachedMtime: string | undefined
    if (existing) {
      // Re-sync if Drive has a newer version. We tagged the existing
      // object with `driveModifiedTime` when we last copied it; if
      // Drive's current modifiedTime differs, the file's bytes have
      // changed (new tags, embedded thumbnail, re-encoded audio, etc.)
      // and we need to overwrite. Without this check, edits made on
      // Drive after the first sync were silently invisible to the app.
      //
      // Also re-sync if the object predates the current
      // CONTENT_TYPE_VERSION — see resolveContentType's comment. This
      // makes a version bump self-heal every previously-mis-typed
      // object over the next several cron ticks with no admin action.
      cachedMtime = existing.customMetadata?.driveModifiedTime
      const cachedContentTypeVersion = existing.customMetadata?.contentTypeVersion
      if (
        cachedMtime === file.modifiedTime &&
        cachedContentTypeVersion === CONTENT_TYPE_VERSION
      ) {
        decision = "skip"
      } else {
        decision = "copy"
      }
    }

    if (debug && result.debug && result.debug.length < 10) {
      result.debug.push({
        name: file.name,
        driveMtime: file.modifiedTime,
        r2Mtime: cachedMtime,
        decision,
      })
    }

    if (decision === "skip") {
      result.skipped += 1
      continue
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
      const debug = url.searchParams.get("debug") === "1"
      const result = await runSync(env, debug)
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
