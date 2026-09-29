export interface SongSharePayload {
  songId: string
  title: string
  artist?: string
}

export interface LyricSharePayload {
  songId: string
  title: string
  artist?: string
  snippet: string
}

export interface PlaylistSharePayload {
  playlistId: string
  name: string
  songCount: number
}

export type ShareKind = "song" | "lyric" | "playlist"

export type SharePayload =
  | { kind: "song"; payload: SongSharePayload }
  | { kind: "lyric"; payload: LyricSharePayload }
  | { kind: "playlist"; payload: PlaylistSharePayload }

/** Mirrors MAX_BODY_LENGTH in workers/chat — the worker re-enforces this,
 *  this is just so the UI doesn't let you compose something doomed to be
 *  truncated server-side. */
export const MAX_SHARE_SNIPPET_LENGTH = 300

const STORAGE_KEY = "scoutbangers:pending-chat-share"

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null
  } catch {
    return null
  }
}

const SHARE_STAGED_EVENT = "scoutbangers:chat-share-staged"

/**
 * One-shot bridge for "share to chat" actions triggered from another page
 * (the song player, the lyrics panel, a playlist). The sender stores the
 * share here and navigates to /chat; GlobalChat stages it above the
 * composer.
 *
 * Backed by sessionStorage rather than a plain module-level variable:
 * the sender (e.g. fullscreen-player.tsx, eagerly bundled) and the
 * receiver (global-chat.tsx, only reachable through chat-page's lazy
 * `import()`) sit on opposite sides of a code-split boundary. This
 * module is small enough that Rollup inlines/duplicates it into both
 * chunks instead of extracting a shared one, so a plain `let` here
 * would silently become two independent variables at runtime — the
 * sender writing to a copy the receiver never reads. sessionStorage is
 * a real browser-level singleton, so it stays correct regardless of how
 * the bundler splits this module.
 *
 * `takePendingShare` alone only covers the case where /chat mounts
 * *after* the share is staged (a fresh navigation). If the user is
 * already on /chat, `navigate("/chat")` is a same-route no-op — nothing
 * remounts, so nothing re-reads sessionStorage. The `SHARE_STAGED_EVENT`
 * covers that case: GlobalChat listens for it via `onPendingShare` and
 * re-checks storage even while already mounted.
 */
export function setPendingShare(share: SharePayload): void {
  try {
    safeSessionStorage()?.setItem(STORAGE_KEY, JSON.stringify(share))
  } catch {
    // Private mode / storage quota — the share action still navigates to
    // /chat, just without anything staged. Best-effort only.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SHARE_STAGED_EVENT))
  }
}

export function takePendingShare(): SharePayload | null {
  const storage = safeSessionStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    storage.removeItem(STORAGE_KEY)
    return JSON.parse(raw) as SharePayload
  } catch {
    return null
  }
}

/** Subscribes to "a share was just staged" while already mounted on
 *  /chat. Returns an unsubscribe function. */
export function onPendingShare(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(SHARE_STAGED_EVENT, callback)
  return () => window.removeEventListener(SHARE_STAGED_EVENT, callback)
}
