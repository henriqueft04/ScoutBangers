import { Music } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Default album art for a song. Solid red block with a music glyph in white —
 * the visual anchor of the app's two-color palette. Sizing is driven entirely
 * via `className`, e.g. `size-10` or `size-12 md:size-14`.
 */
export function SongArtwork({ className }: { className?: string }) {
  return (
    <div
      data-slot="song-artwork"
      aria-hidden
      className={cn(
        "bg-primary text-primary-foreground flex aspect-square shrink-0 items-center justify-center rounded-md",
        className
      )}
    >
      <Music className="size-1/2" />
    </div>
  )
}
