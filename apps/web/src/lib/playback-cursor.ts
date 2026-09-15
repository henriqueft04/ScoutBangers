/**
 * Index of the natural-sequence anchor song within `playbackList`, or -1
 * if it isn't there (nothing has played yet, or the anchor song was
 * dropped from the catalog). `playbackCursorId` tracks the last song
 * reached by ordinary next()/prev()/auto-advance — as opposed to
 * `currentIndex`, which can point at a song played out of order from the
 * user's explicit queue. Every consumer that needs "where are we in the
 * list" (auto-advance, the Up Next panel, drag-reorder, HTTP prefetch)
 * shares this one lookup so they all agree on what that means.
 */
export function playbackCursorIndex(
  playbackList: readonly string[],
  playbackCursorId: string | null
): number {
  return playbackCursorId ? playbackList.indexOf(playbackCursorId) : -1
}
