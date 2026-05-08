/**
 * IndexedDB-backed persistent cache for track metadata.
 *
 * Replaces the previous localStorage cache. localStorage capped us at
 * roughly ~5 MB and required base64 encoding for binary data (album art),
 * which added ~33% overhead and meant covers were silently dropped past
 * ~80 songs. IndexedDB stores Blobs natively and offers tens of MB.
 *
 * The on-disk shape mirrors the in-memory `TrackMetadata` plus a
 * `modifiedTime` field used for cache invalidation: when a song is
 * re-uploaded with new tags, its modifiedTime changes, the cache entry
 * is evicted, and the next read re-fetches.
 */

const DB_NAME = "scoutbangers"
const STORE_NAME = "track-metadata"
const DB_VERSION = 1

export interface PersistedMetadata {
  songId: string
  modifiedTime?: string
  artist?: string
  album?: string
  title?: string
  pictureBlob?: Blob
  pictureType?: string
  cachedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"))
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "songId" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

export async function getAllPersisted(): Promise<PersistedMetadata[]> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly")
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result as PersistedMetadata[])
      request.onerror = () => reject(request.error)
    })
  } catch {
    return []
  }
}

export async function putPersisted(entry: PersistedMetadata): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      tx.objectStore(STORE_NAME).put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Best-effort: silently drop on quota / private-mode failures.
  }
}

export async function deletePersisted(songId: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      tx.objectStore(STORE_NAME).delete(songId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* best-effort */
  }
}
