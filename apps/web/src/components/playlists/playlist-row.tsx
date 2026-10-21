import * as React from "react"
import { Bookmark } from "lucide-react"
import { Link } from "react-router-dom"

import { PlaylistThumb } from "@/components/playlists/playlist-thumb"

interface PlaylistRowProps {
  id: string
  name: string
  /** Shown as "de {owner}" under the name. */
  ownerName?: string
  songCount: number
  saveCount?: number
  coverUrl?: string | null
  previewSongIds?: string[]
  /** Small icon next to the name (lock / globe / bookmark). */
  icon?: React.ReactNode
  /** Extra controls rendered after the link, e.g. a delete button. */
  action?: React.ReactNode
}

/** Shared row for the "As minhas", "Guardadas" and "Descobrir" lists. */
export function PlaylistRow({
  id,
  name,
  ownerName,
  songCount,
  saveCount,
  coverUrl,
  previewSongIds,
  icon,
  action,
}: PlaylistRowProps) {
  return (
    <div className="hover:bg-accent/40 flex items-center gap-2 rounded-md pr-1 transition-colors">
      <Link
        to={`/playlists/${id}`}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2.5"
      >
        <span className="text-foreground flex min-w-0 items-center gap-3 text-sm font-medium">
          <PlaylistThumb
            seed={id}
            coverUrl={coverUrl}
            previewSongIds={previewSongIds}
          />
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1.5">
              {icon}
              <span className="truncate">{name}</span>
            </span>
            {ownerName ? (
              <span className="text-muted-foreground truncate text-xs">
                de {ownerName}
              </span>
            ) : null}
          </span>
        </span>
        <span className="text-muted-foreground flex shrink-0 items-center gap-3 text-xs">
          {saveCount ? (
            <span
              className="inline-flex items-center gap-1"
              aria-label={`${saveCount} guardadas`}
            >
              <Bookmark className="size-3" />
              {saveCount}
            </span>
          ) : null}
          <span>
            {songCount} {songCount === 1 ? "música" : "músicas"}
          </span>
        </span>
      </Link>
      {action}
    </div>
  )
}
