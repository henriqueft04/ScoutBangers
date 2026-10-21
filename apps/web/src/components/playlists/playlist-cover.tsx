import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { SongArtwork } from "@/components/library/song-artwork"
import { TrackArtwork } from "@/components/library/track-artwork"
import { useInView } from "@/hooks/useInView"
import { useTrackVisuals } from "@/hooks/useTrackVisuals"
import { makeThumbnail } from "@/lib/image-thumbnail"
import {
  ensureTrackMetadata,
  peekTrackMetadata,
  subscribeToAnyMetadata,
} from "@/lib/track-metadata"
import { ensureArtHash, peekArtHash, sameArt, type ArtHash } from "@/lib/art-hash"
import type { Song } from "@/lib/types"

interface Slot {
  left: number
  top: number
  width: number
  height: number
}

/** Fewest and most artworks a banner shows. */
const MIN_TILES = 6
const MAX_TILES = 9

/** How many songs' tags are read at first, and per step, to find distinct art. */
const CANDIDATE_STEP = 12
const MAX_CANDIDATES = 48

/** Number of tiles a seed asks for (before limiting to the distinct covers). */
function wantedTiles(seed: string) {
  return MIN_TILES + Math.floor(seededRandom(seed)() * (MAX_TILES - MIN_TILES + 1))
}

/**
 * Picks up to `wanted` songs whose artwork looks different from each other
 * (compared perceptually, see art-hash), reading
 * tags a dozen songs at a time until enough distinct covers turn up (or the
 * candidates run out). Songs with no artwork are skipped; if none has any,
 * the first song is returned so the placeholder still shows.
 */
function useDistinctArtSongs(
  songs: Song[],
  wanted: number,
  enabled: boolean
): Song[] {
  const [, rerender] = React.useReducer((n: number) => n + 1, 0)
  const [windowSize, setWindowSize] = React.useState(CANDIDATE_STEP)
  const candidates = songs.slice(0, MAX_CANDIDATES)
  const windowed = candidates.slice(0, windowSize)

  // Keyed by ids: callers rebuild `songs` on every render, and re-running
  // this effect each time would re-trigger the metadata loads.
  const windowKey = windowed.map((song) => song.id).join(",")
  React.useEffect(() => {
    if (!enabled) return
    for (const song of windowed) void ensureTrackMetadata(song.id, song.modifiedTime)
    return subscribeToAnyMetadata(rerender)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, windowKey])

  // Hash each loaded cover once; reruns are cheap (cached / in flight).
  const blobs = new Map<string, Blob>()
  for (const song of windowed) {
    const meta = peekTrackMetadata(song.id)
    const blob = meta?.thumbBlob ?? meta?.pictureBlob
    if (blob) {
      blobs.set(song.id, blob)
      ensureArtHash(`${song.id}:${blob.size}`, blob, rerender)
    }
  }

  const seen: ArtHash[] = []
  const picked: Song[] = []
  let allResolved = true
  for (const song of windowed) {
    const meta = peekTrackMetadata(song.id)
    if (!meta) {
      allResolved = false
      continue
    }
    const blob = blobs.get(song.id)
    if (!blob) continue // no artwork
    const hash = peekArtHash(`${song.id}:${blob.size}`)
    if (hash === undefined) {
      allResolved = false
      continue
    }
    // An undecodable cover can't be compared; keep it rather than lose it.
    if (hash && seen.some((other) => sameArt(other, hash))) continue
    if (hash) seen.push(hash)
    picked.push(song)
    if (picked.length >= wanted) break
  }

  const needMore =
    allResolved && picked.length < wanted && windowSize < candidates.length
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (needMore) setWindowSize((size) => size + CANDIDATE_STEP)
  }, [needMore, windowSize])

  return picked.length > 0 ? picked : candidates.slice(0, 1)
}

/** Small seeded PRNG (mulberry32), so a playlist always gets the same look. */
function seededRandom(seed: string) {
  let h = 1779033703
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Splits the banner into 6–9 rectangles (fewer if there are fewer songs): the biggest one is repeatedly cut
 * across its longer side at a random point. Same seed, same layout. Values
 * are % of the banner.
 */
function buildLayout(seed: string, available: number): Slot[] {
  const random = seededRandom(seed)
  const wanted = MIN_TILES + Math.floor(random() * (MAX_TILES - MIN_TILES + 1))
  // One tile per song at most: covers are never repeated.
  const count = Math.max(1, Math.min(wanted, available))
  const slots: Slot[] = [{ left: 0, top: 0, width: 100, height: 100 }]
  // Real shape of a slot: width is stretched by the banner's aspect ratio.
  const area = (slot: Slot) => slot.width * COVER_ASPECT * slot.height
  while (slots.length < count) {
    // Pick among the larger slots so tiles stay roughly balanced.
    const ranked = slots
      .map((slot, index) => ({ index, area: area(slot) }))
      .sort((x, y) => y.area - x.area)
    const pick = ranked[Math.floor(random() * Math.min(2, ranked.length))]!
    const slot = slots[pick.index]!
    const ratio = 0.35 + random() * 0.3
    const splitWide = slot.width * COVER_ASPECT >= slot.height
    const [first, second]: [Slot, Slot] = splitWide
      ? [
          { ...slot, width: slot.width * ratio },
          {
            ...slot,
            left: slot.left + slot.width * ratio,
            width: slot.width * (1 - ratio),
          },
        ]
      : [
          { ...slot, height: slot.height * ratio },
          {
            ...slot,
            top: slot.top + slot.height * ratio,
            height: slot.height * (1 - ratio),
          },
        ]
    slots.splice(pick.index, 1, first, second)
  }
  return slots
}

/** Width / height of the banner: the golden ratio. */
const COVER_ASPECT = 1.618

/** Side of the sharper copy used by the big banner (list thumbs are 192 px). */
const BANNER_ART_SIDE = 640

/**
 * A mid-size square copy of the cover for the big banner, where the 192 px
 * list thumbnail would show pixelated. Falls back to `undefined` (the thumb)
 * until it is ready.
 */
function useBannerArt(blob: Blob | undefined, enabled: boolean) {
  const [state, setState] = React.useState<{ blob: Blob; url: string }>()
  React.useEffect(() => {
    if (!enabled || !blob) return
    let cancelled = false
    let url: string | undefined
    void makeThumbnail(blob, BANNER_ART_SIDE, true).then((scaled) => {
      if (cancelled || !scaled) return
      url = URL.createObjectURL(scaled)
      setState({ blob, url })
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [blob, enabled])
  return state && state.blob === blob ? state.url : undefined
}

function SpiralTile({
  song,
  slot,
  compact,
}: {
  song: Song
  slot: Slot
  compact: boolean
}) {
  // Loads the thumbnail lazily, like every other song row.
  const { ref, meta } = useTrackVisuals<HTMLDivElement>(
    song.id,
    true,
    song.modifiedTime
  )
  const sharpUrl = useBannerArt(meta?.pictureBlob, !compact)
  return (
    <div
      ref={ref}
      className={cn("absolute", compact ? "p-px" : "p-[2px]")}
      style={{
        left: `${slot.left}%`,
        top: `${slot.top}%`,
        width: `${slot.width}%`,
        height: `${slot.height}%`,
      }}
    >
      {sharpUrl ? (
        <img
          src={sharpUrl}
          alt=""
          decoding="async"
          className="size-full rounded-md object-cover"
        />
      ) : (
        <TrackArtwork meta={meta} className="size-full" />
      )}
    </div>
  )
}

interface PlaylistCoverProps {
  /** Songs in playlist order; the first few are used for the artwork. */
  songs: Song[]
  /** Custom uploaded cover; wins over the song artwork when set. */
  coverUrl?: string | null
  /** Tighter gaps and no shadow, for small list thumbnails. */
  compact?: boolean
  /** Picks the tile layout (use the playlist id); same seed, same look. */
  seed?: string
  className?: string
}

/**
 * Playlist banner. A custom cover fills it. Otherwise 6–9 song artworks
 * (the count and layout are random per playlist) tile the banner. Songs that
 * share artwork (same album) count once, so no cover appears twice; a
 * playlist with fewer distinct covers gets fewer tiles.
 */
export function PlaylistCover({
  songs,
  coverUrl,
  compact = false,
  seed = "",
  className,
}: PlaylistCoverProps) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const wanted = wantedTiles(seed)
  const distinct = useDistinctArtSongs(
    songs,
    wanted,
    inView && !coverUrl
  )
  const layout = React.useMemo(
    () => buildLayout(seed, distinct.length),
    [seed, distinct.length]
  )
  return (
    <div
      ref={ref}
      className={cn(
        "bg-card relative w-full overflow-hidden",
        !compact && "shadow-xl",
        className
      )}
      style={{ aspectRatio: COVER_ASPECT }}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          decoding="async"
          className="size-full object-cover"
        />
      ) : distinct.length > 0 ? (
        layout.map((slot, index) => (
          <SpiralTile
            key={index}
            song={distinct[index]!}
            slot={slot}
            compact={compact}
          />
        ))
      ) : (
        <SongArtwork className="size-full rounded-none" />
      )}
    </div>
  )
}
