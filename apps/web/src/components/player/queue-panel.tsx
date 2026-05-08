import * as React from "react"
import { GripVertical, Trash2, X } from "lucide-react"
import { Reorder, useMotionValue } from "framer-motion"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { TrackArtwork } from "@/components/library/track-artwork"
import { useTrackVisuals } from "@/hooks/useTrackVisuals"
import { usePlayer } from "@/hooks/usePlayer"
import { displayArtist, displayTitle } from "@/lib/song-display"
import type { QueueItem, Song } from "@/lib/types"

interface QueuePanelProps {
  onClose?: () => void
  className?: string
}

/**
 * Up Next panel with two reorderable sections:
 *  - "Next in queue": user-injected items (drag, X to remove)
 *  - "Up next":       songs derived from the playback list (drag, X to drop)
 *
 * Drag is powered by framer-motion's Reorder.Group/Reorder.Item — the
 * entire row is the drag target. Each list passes Reorder a `values`
 * array of OBJECT references with a stable per-row identity (`key` for
 * the user queue, `id` for the upcoming derived list) so reordering
 * doesn't unmount items mid-drag.
 */
export function QueuePanel({ onClose, className }: QueuePanelProps) {
  const {
    songs,
    currentIndex,
    userQueue,
    playbackList,
    queueRemove,
    queueSet,
    queueClear,
    reorderUpcoming,
    removeFromUpcoming,
    play,
  } = usePlayer()

  const songsById = React.useMemo(
    () => new Map(songs.map((song) => [song.id, song])),
    [songs]
  )

  // Render data for the "Up next" section: each visible upcoming song,
  // wrapped so it has a stable identity for Reorder.
  const upcomingItems = React.useMemo(() => {
    const currentSongId =
      currentIndex !== null ? songs[currentIndex]?.id ?? null : null
    const skip = new Set<string>(userQueue.map((item) => item.songId))
    if (currentSongId) skip.add(currentSongId)
    const here = currentSongId ? playbackList.indexOf(currentSongId) : -1
    const out: { id: string }[] = []
    for (let i = here + 1; i < playbackList.length; i++) {
      const id = playbackList[i]!
      if (skip.has(id)) continue
      skip.add(id)
      out.push({ id })
      if (out.length >= 50) break
    }
    return out
  }, [playbackList, currentIndex, songs, userQueue])

  const handlePlay = (songId: string) => {
    const idx = songs.findIndex((song) => song.id === songId)
    if (idx !== -1) play(idx)
  }

  const handleQueueReorder = (next: QueueItem[]) => {
    if (
      next.length === userQueue.length &&
      next.every((item, i) => item.key === userQueue[i]?.key)
    ) {
      return
    }
    queueSet(next)
  }

  const handleUpcomingReorder = (next: { id: string }[]) => {
    if (
      next.length === upcomingItems.length &&
      next.every((item, i) => item.id === upcomingItems[i]?.id)
    ) {
      return
    }
    reorderUpcoming(next.map((item) => item.id))
  }

  return (
    <div
      className={cn(
        "bg-background text-foreground flex h-full flex-col overflow-hidden",
        className
      )}
    >
      <header className="border-border flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-foreground text-base font-semibold tracking-tight">
          Up Next
        </h2>
        <div className="flex items-center gap-1">
          {userQueue.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={queueClear}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
          ) : null}
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close queue"
              onClick={onClose}
            >
              <X />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
        {userQueue.length === 0 && upcomingItems.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center px-6 py-10 text-center text-sm">
            Nothing in the queue. Swipe a song right or tap the queue button on
            a song row to add it.
          </div>
        ) : (
          <>
            {userQueue.length > 0 ? (
              <section>
                <h3 className="text-muted-foreground px-2 pb-1 pt-2 text-xs uppercase tracking-wider">
                  Next in queue
                </h3>
                <Reorder.Group
                  axis="y"
                  values={userQueue}
                  onReorder={handleQueueReorder}
                  className="flex flex-col"
                >
                  {userQueue.map((item, index) => (
                    <ReorderableRow
                      key={item.key}
                      value={item}
                      song={songsById.get(item.songId)}
                      onPlay={() => handlePlay(item.songId)}
                      onRemove={() => queueRemove(index)}
                    />
                  ))}
                </Reorder.Group>
              </section>
            ) : null}
            {upcomingItems.length > 0 ? (
              <section>
                <h3 className="text-muted-foreground px-2 pb-1 pt-2 text-xs uppercase tracking-wider">
                  Up next
                </h3>
                <Reorder.Group
                  axis="y"
                  values={upcomingItems}
                  onReorder={handleUpcomingReorder}
                  className="flex flex-col"
                >
                  {upcomingItems.map((item) => (
                    <ReorderableRow
                      key={item.id}
                      value={item}
                      song={songsById.get(item.id)}
                      onPlay={() => handlePlay(item.id)}
                      onRemove={() => removeFromUpcoming(item.id)}
                    />
                  ))}
                </Reorder.Group>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

interface ReorderableRowProps<V> {
  value: V
  song: Song | undefined
  onPlay: () => void
  onRemove: () => void
}

/**
 * One draggable row inside a Reorder.Group. The whole row is the drag
 * target — framer-motion routes short pointer events to onClick (play)
 * and longer drags to reorder. The trash button stops propagation so
 * removing never starts a drag.
 *
 * Generic over V so the same row works for both `QueueItem` (user
 * queue) and `{ id: string }` (upcoming list) without sharing a value
 * shape.
 */
const SWIPE_REMOVE_THRESHOLD = 80
const SWIPE_REMOVE_MAX = 140

function ReorderableRow<V>({ value, song, onPlay, onRemove }: ReorderableRowProps<V>) {
  const { ref, meta } = useTrackVisuals<HTMLDivElement>(song?.id)
  const title = song ? displayTitle(song, meta) : "Unavailable"
  const artist = song ? displayArtist(song, meta) : undefined

  // Swipe-left to remove. Uses framer-motion's onPan event listener,
  // which runs alongside the Reorder.Item's built-in Y drag. We lock
  // direction on the first significant movement so vertical drags
  // continue to feel like reorder and horizontal drags become a remove
  // gesture. The X offset is animated via a motion value applied to
  // Reorder.Item itself — framer-motion composes it with its internal
  // y transform without conflict.
  const x = useMotionValue(0)
  const directionRef = React.useRef<"x" | "y" | null>(null)
  const [showRemoveBg, setShowRemoveBg] = React.useState(false)
  const swipingLeftRef = React.useRef(false)

  return (
    <Reorder.Item
      value={value}
      whileDrag={{
        scale: 1.02,
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        zIndex: 10,
      }}
      dragElastic={0}
      dragMomentum={false}
      style={{ x }}
      onPanStart={() => {
        directionRef.current = null
        swipingLeftRef.current = false
      }}
      onPan={(_, info) => {
        if (!directionRef.current) {
          const adx = Math.abs(info.offset.x)
          const ady = Math.abs(info.offset.y)
          if (adx <= 6 && ady <= 6) return
          directionRef.current = adx > ady ? "x" : "y"
        }
        if (directionRef.current !== "x") return
        if (info.offset.x < 0) {
          swipingLeftRef.current = true
          const clamped = Math.max(info.offset.x, -SWIPE_REMOVE_MAX)
          x.set(clamped)
          setShowRemoveBg(clamped <= -8)
        } else {
          x.set(0)
          setShowRemoveBg(false)
        }
      }}
      onPanEnd={(_, info) => {
        if (
          directionRef.current === "x" &&
          swipingLeftRef.current &&
          info.offset.x <= -SWIPE_REMOVE_THRESHOLD
        ) {
          onRemove()
        }
        x.set(0)
        setShowRemoveBg(false)
        directionRef.current = null
        swipingLeftRef.current = false
      }}
      className="relative"
    >
      {/* Red destructive background reveal when swiping left */}
      <div
        aria-hidden
        className={cn(
          "bg-destructive/10 text-destructive pointer-events-none absolute inset-0 flex items-center justify-end rounded-md pr-4 transition-opacity",
          showRemoveBg ? "opacity-100" : "opacity-0"
        )}
      >
        <Trash2 className="size-5" />
        <span className="ml-2 text-xs font-medium uppercase tracking-wider">
          Remove
        </span>
      </div>
      <div className="bg-background hover:bg-muted/60 relative flex min-w-0 cursor-grab items-center gap-2 rounded-md px-2 py-2 active:cursor-grabbing">
        <GripVertical
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
        <div
          ref={ref}
          onClick={(event) => {
            // Suppress click after a swipe.
            if (Math.abs(x.get()) > 4) {
              event.preventDefault()
              return
            }
            onPlay()
          }}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <TrackArtwork meta={meta} className="size-10" />
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-sm font-medium">
              {title}
            </p>
            {artist ? (
              <p className="text-muted-foreground truncate text-xs">{artist}</p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remove from queue"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          className="text-muted-foreground hover:text-destructive shrink-0"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </Reorder.Item>
  )
}
