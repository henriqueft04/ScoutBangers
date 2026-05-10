import * as React from "react"
import { ExternalLink, Music2, RefreshCw, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useLyrics } from "@/hooks/useLyrics"
import { usePlayer } from "@/hooks/usePlayer"
import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import {
  getLyricsLinkFor,
  lyricsLastUpdatedAt,
  refreshLyrics,
} from "@/lib/lyrics"
import { displayTitle } from "@/lib/song-display"

interface LyricsPanelProps {
  onClose?: () => void
  className?: string
  /**
   * `sheet` (default): mobile / fullscreen-player layout — small text,
   * left-aligned. `inline`: desktop center-column overlay — much larger
   * text, centered horizontally with a comfortable reading column.
   */
  variant?: "sheet" | "inline"
}

function formatRelative(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return "agora mesmo"
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    return `há ${m} min`
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600)
    return `há ${h} h`
  }
  const d = Math.floor(seconds / 86400)
  return `há ${d} d${d === 1 ? "ia" : "ias"}`
}

/**
 * Bottom-sheet panel showing the lyrics for the currently playing
 * song. Mirrors the QueuePanel layout — same drag-handle hint,
 * same scroll behaviour.
 *
 * Lyrics come from the cached /api/lyrics map (see lib/lyrics.ts).
 * The map auto-refreshes every 24 h; the user can also force an
 * immediate refresh from the header. When the song has no entry in
 * the cache we display an "indisponível" state and trigger a
 * background refetch in case it's a newly added song.
 */
export function LyricsPanel({
  onClose,
  className,
  variant = "sheet",
}: LyricsPanelProps) {
  const inline = variant === "inline"
  const { songs, currentIndex } = usePlayer()
  const song = currentIndex !== null ? songs[currentIndex] : undefined
  const meta = useTrackMetadata(song?.id, Boolean(song), song?.modifiedTime)
  const title = song ? displayTitle(song, meta) : null
  const lyrics = useLyrics(title ?? undefined)
  const [refreshing, setRefreshing] = React.useState(false)
  const [updatedAt, setUpdatedAt] = React.useState(() => lyricsLastUpdatedAt())

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true)
    const next = await refreshLyrics()
    setUpdatedAt(next?.fetchedAt ?? null)
    setRefreshing(false)
  }, [])

  return (
    <div
      className={cn(
        "bg-background text-foreground flex h-full flex-col overflow-hidden",
        className
      )}
    >
      <header className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-foreground truncate text-base font-semibold tracking-tight">
            Letra
          </h2>
          {title ? (
            <p className="text-muted-foreground truncate text-xs">{title}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {title && lyrics ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              asChild
              className="text-muted-foreground hover:text-foreground gap-1.5"
              title="Abrir o Cancioneiro nesta música (com acordes)"
            >
              <a
                href={getLyricsLinkFor(title)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-3.5" />
                Ver acordes
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Atualizar letras"
            title={
              updatedAt
                ? `Última atualização ${formatRelative(updatedAt)}`
                : "Atualizar letras"
            }
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          </Button>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Fechar letra"
              onClick={onClose}
            >
              <X />
            </Button>
          ) : null}
        </div>
      </header>

      <div
        className={cn(
          "flex-1 overflow-y-auto",
          inline ? "px-6 py-10" : "px-5 py-4"
        )}
      >
        {lyrics ? (
          <pre
            className={cn(
              "text-foreground whitespace-pre-wrap font-sans",
              inline
                ? "mx-auto max-w-5xl text-center text-base leading-relaxed lg:columns-2 lg:gap-12 lg:text-lg [&>*]:break-inside-avoid"
                : "text-sm leading-relaxed"
            )}
          >
            {lyrics}
          </pre>
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-sm">
            <Music2 className="size-8 opacity-40" />
            <p>Letra indisponível para esta música.</p>
            <p className="text-xs opacity-80">
              {song
                ? "Se foi adicionada recentemente ao Cancioneiro, atualiza."
                : "Toca uma música para veres a letra."}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
