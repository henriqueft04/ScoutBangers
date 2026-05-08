import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import type { TrackMetadata } from "@/lib/track-metadata"

import { SongArtwork } from "./song-artwork"

interface TrackArtworkProps {
  meta: TrackMetadata | null | undefined
  className?: string
  /** Optional element rendered absolutely on top — e.g. a hover play overlay. */
  overlay?: React.ReactNode
  alt?: string
}

/**
 * Picture-or-fallback artwork tile, used by every row that shows a song
 * thumbnail. Resolves the embedded picture URL when present, otherwise
 * falls back to the brand placeholder. The wrapper is `relative` so
 * callers can drop an `overlay` (e.g. play/pause icon) on top.
 */
export function TrackArtwork({
  meta,
  className,
  overlay,
  alt = "",
}: TrackArtworkProps) {
  return (
    <div className={cn("relative shrink-0", className)}>
      {meta?.pictureUrl ? (
        <img
          src={meta.pictureUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="size-full rounded-md object-cover"
        />
      ) : (
        <SongArtwork className="size-full" />
      )}
      {overlay}
    </div>
  )
}
