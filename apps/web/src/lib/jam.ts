import {
  MAX_ORDER,
  ROOM_ID_LENGTH,
  ROOM_ID_PATTERN,
  type JamQueueEntry,
} from "@/lib/jam-protocol"
import { playbackCursorIndex } from "@/lib/playback-cursor"
import type { QueueInput, QueueItem } from "@/lib/types"

/**
 * Jam rooms live on the relay in workers/jam. The invite link is just the
 * room id: `/?jam=<roomId>`.
 */
const JAM_PARAM = "jam"

export function createRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_ID_LENGTH))
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("")
}

export function buildInviteUrl(origin: string, roomId: string): string {
  const url = new URL("/", origin)
  url.searchParams.set(JAM_PARAM, roomId)
  return url.toString()
}

/** The room id from an invite link's query string, if it has a valid one. */
export function readInviteRoomId(search: string): string | null {
  const roomId = new URLSearchParams(search).get(JAM_PARAM)
  return roomId && ROOM_ID_PATTERN.test(roomId) ? roomId : null
}

export function stripInviteParam(url: URL): void {
  url.searchParams.delete(JAM_PARAM)
}

interface UpcomingSource {
  currentSongId: string | null
  userQueue: readonly QueueItem[]
  playbackList: readonly string[]
  playbackCursorId: string | null
}

/**
 * Songs the natural sequence will reach next, skipping the current song and
 * anything already in the user queue (which plays first, and is listed
 * separately). Shared by the Up Next panel and the jam.
 */
export function upcomingSongIds(
  { currentSongId, userQueue, playbackList, playbackCursorId }: UpcomingSource,
  limit = Infinity
): string[] {
  const skip = new Set<string>(userQueue.map((item) => item.songId))
  if (currentSongId) skip.add(currentSongId)
  // Anchor on the natural-sequence cursor, not the current song — while a
  // queued (out-of-order) song plays, its own position in `playbackList` is
  // unrelated to what is actually next. See `playbackCursorIndex`.
  const here = playbackCursorIndex(playbackList, playbackCursorId)
  const out: string[] = []
  for (let i = here + 1; i < playbackList.length && out.length < limit; i++) {
    const id = playbackList[i]!
    if (skip.has(id)) continue
    skip.add(id)
    out.push(id)
  }
  return out
}

/**
 * The slice of the playback order worth sharing: all of it, or — for a
 * library bigger than the protocol allows — from the cursor onward.
 */
export function orderWindow(
  playbackList: readonly string[],
  cursorId: string | null
): string[] {
  if (playbackList.length <= MAX_ORDER) return [...playbackList]
  const from = Math.max(0, playbackCursorIndex(playbackList, cursorId))
  return playbackList.slice(from, from + MAX_ORDER)
}

/**
 * Whether `local` is what the room has, as far as this listener can tell:
 * ids this listener doesn't have are ignored on the room's side. Without
 * that, a listener missing a few songs would look like it had "changed" the
 * list and push its shorter version to everyone.
 */
export function sameIds(
  local: readonly string[],
  room: readonly string[],
  known: ReadonlySet<string>
): boolean {
  const visible = room.filter((id) => known.has(id))
  return local.length === visible.length && local.every((id, i) => visible[i] === id)
}

/**
 * The user queue as the room sees it. Songs this listener queued carry no
 * author locally, so they are stamped with `me`; songs that arrived from
 * the room keep whoever queued them.
 */
export function queueEntries(
  userQueue: readonly QueueItem[],
  me: string
): JamQueueEntry[] {
  return userQueue.map((item) => ({ id: item.songId, by: item.addedBy ?? me }))
}

/** The room's queue as player queue items, for the songs this listener has. */
export function queueInputs(
  entries: readonly JamQueueEntry[],
  known: ReadonlySet<string>
): QueueInput[] {
  return entries
    .filter((entry) => known.has(entry.id))
    .map((entry) => ({
      songId: entry.id,
      ...(entry.by ? { addedBy: entry.by } : {}),
    }))
}
