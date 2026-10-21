import { cn } from "@workspace/ui/lib/utils"

import { useTrackVisuals } from "@/hooks/useTrackVisuals"
import type { Album } from "@/lib/albums"

import { TrackArtwork } from "./track-artwork"

interface AlbumsStripProps {
  albums: Album[]
  /** `key` of the album the list is narrowed to, if any. */
  selectedKey: string | null
  /** Called with the tapped album's key, or null when it is tapped again. */
  onSelect: (key: string | null) => void
}

interface AlbumCardProps {
  album: Album
  selected: boolean
  onSelect: () => void
}

function AlbumCard({ album, selected, onSelect }: AlbumCardProps) {
  // Same lazy loading as a song row: the cover's thumbnail is read once the
  // card is near the screen.
  const { ref, meta } = useTrackVisuals<HTMLLIElement>(
    album.cover.id,
    true,
    album.cover.modifiedTime
  )
  return (
    <li ref={ref} className="w-22 shrink-0 snap-start">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="flex w-full flex-col gap-1.5 text-left"
      >
        <TrackArtwork
          meta={meta}
          className={cn(
            "size-22 rounded-md",
            selected && "ring-primary ring-2 ring-offset-2"
          )}
        />
        <span className="min-w-0">
          <span className="text-foreground block truncate text-xs font-medium">
            {album.name}
          </span>
          <span className="text-muted-foreground block text-[11px]">
            {album.songs.length} músicas
          </span>
        </span>
      </button>
    </li>
  )
}

/** Horizontally sliding row of album covers; tap one to see only its songs. */
export function AlbumsStrip({
  albums,
  selectedKey,
  onSelect,
}: AlbumsStripProps) {
  return (
    <section aria-label="Álbuns" className="flex flex-col gap-2">
      <h2 className="text-foreground text-sm font-semibold tracking-tight">
        Álbuns
      </h2>
      <ul
        role="list"
        className="-mx-3 flex snap-x scroll-pl-3 gap-3 overflow-x-auto px-3 pt-1.5 pb-1 md:mx-0 md:scroll-pl-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {albums.map((album) => (
          <AlbumCard
            key={album.key}
            album={album}
            selected={album.key === selectedKey}
            onSelect={() =>
              onSelect(album.key === selectedKey ? null : album.key)
            }
          />
        ))}
      </ul>
    </section>
  )
}
