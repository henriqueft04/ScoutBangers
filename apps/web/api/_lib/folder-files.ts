/**
 * Cached list of file IDs in the Drive folder, keyed by folder id.
 * Used by `/api/stream/[id]` to validate the requested file id against
 * the allowlist of files actually shared in the public folder — without
 * this, anyone could use the stream proxy to pipe arbitrary Drive files
 * (limited to ones the service account can read, but still wasteful of
 * Vercel bandwidth).
 *
 * Cache TTL is 5 minutes — matches the `/api/songs` Vercel edge cache
 * so updates propagate at the same cadence.
 */

const DRIVE_LIST_URL = "https://www.googleapis.com/drive/v3/files"
const TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  ids: Set<string>
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

interface DriveListResponse {
  files?: Array<{ id: string }>
  nextPageToken?: string
}

/**
 * Returns the set of file ids in the given Drive folder (audio files,
 * not trashed). Cached per folder for 5 minutes. Throws on Drive errors
 * — callers should handle and decide whether to fail open or closed.
 */
export async function listFolderFileIds(
  token: string,
  folderId: string
): Promise<Set<string>> {
  const cached = cache.get(folderId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ids
  }

  const ids = new Set<string>()
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType contains 'audio/' and trashed = false`,
      fields: "nextPageToken,files(id)",
      pageSize: "1000",
    })
    if (pageToken) params.set("pageToken", pageToken)

    const res = await fetch(`${DRIVE_LIST_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new Error(`Drive list failed: ${res.status}`)
    }
    const data = (await res.json()) as DriveListResponse
    for (const file of data.files ?? []) ids.add(file.id)
    pageToken = data.nextPageToken
  } while (pageToken)

  cache.set(folderId, { ids, expiresAt: Date.now() + TTL_MS })
  return ids
}
