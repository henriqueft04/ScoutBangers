import * as React from "react"
import { ExternalLink, MessageCircle, Music2, RefreshCw, X } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useLyrics } from "@/hooks/useLyrics"
import { usePlayer } from "@/hooks/usePlayer"
import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import { MAX_SHARE_SNIPPET_LENGTH, setPendingShare } from "@/lib/chat-share"
import {
  getLyricsLinkFor,
  lyricsLastUpdatedAt,
  refreshLyrics,
} from "@/lib/lyrics"
import { displayArtist, displayTitle } from "@/lib/song-display"

interface LyricsPanelProps {
  onClose?: () => void
  className?: string
  /**
   * `sheet` (default): mobile / fullscreen-player layout — small text,
   * left-aligned. `inline`: desktop center-column overlay — much larger
   * text, centered horizontally with a comfortable reading column.
   */
  variant?: "sheet" | "inline"
  /**
   * Called (in addition to `onClose`) right before navigating to /chat
   * after a lyric share. When this panel is nested inside the fullscreen
   * player's bottom sheet, `onClose` alone only closes the lyrics sheet —
   * the fullscreen player itself stays open, covering the chat page
   * underneath. The fullscreen player passes its own close here so both
   * layers collapse together. The desktop inline variant has nothing
   * above it to close, so it leaves this unset.
   */
  onBeforeShareNavigate?: () => void
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
  onBeforeShareNavigate,
}: LyricsPanelProps) {
  const inline = variant === "inline"
  const navigate = useNavigate()
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

  // Tap-to-select a range of lines to share to chat. `anchor` is where the
  // selection started; `focus` is the line most recently tapped — the
  // selected range is always [min, max] of the two, so tapping a line
  // before or after the anchor extends the range in either direction.
  const [selection, setSelection] = React.useState<{
    anchor: number
    focus: number
  } | null>(null)
  const lines = React.useMemo(() => lyrics?.split("\n") ?? [], [lyrics])

  // A different song's lyrics loaded — any in-progress line selection
  // referred to the old lyrics and no longer makes sense.
  React.useEffect(() => {
    setSelection(null)
  }, [lyrics])

  const selectedRange = selection
    ? ([
        Math.min(selection.anchor, selection.focus),
        Math.max(selection.anchor, selection.focus),
      ] as const)
    : null

  const handleLineTap = (index: number) => {
    setSelection((prev) => {
      // Tapping the sole selected line again deselects it — otherwise a
      // single-line selection could only ever be cleared via "Cancelar",
      // never by tapping it back off.
      if (prev && prev.anchor === index && prev.focus === index) return null
      if (prev) return { anchor: prev.anchor, focus: index }
      return { anchor: index, focus: index }
    })
  }

  const handleShareSelection = () => {
    if (!selectedRange || !song || !title) return
    const [start, end] = selectedRange
    const snippet = lines
      .slice(start, end + 1)
      .join("\n")
      .trim()
      .slice(0, MAX_SHARE_SNIPPET_LENGTH)
    if (!snippet) return
    setPendingShare({
      kind: "lyric",
      payload: { songId: song.id, title, artist: displayArtist(song, meta), snippet },
    })
    setSelection(null)
    onClose?.()
    onBeforeShareNavigate?.()
    navigate("/chat")
  }

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
          <div
            className={cn(
              "text-foreground font-sans",
              inline
                ? "mx-auto max-w-5xl text-center text-base leading-relaxed lg:columns-2 lg:gap-12 lg:text-lg [&>*]:break-inside-avoid"
                : "text-sm leading-relaxed"
            )}
          >
            {lines.map((line, index) => {
              if (!line.trim()) {
                return (
                  <p key={index} className="whitespace-pre-wrap">
                    {" "}
                  </p>
                )
              }
              const isSelected =
                selectedRange !== null &&
                index >= selectedRange[0] &&
                index <= selectedRange[1]
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleLineTap(index)}
                  className={cn(
                    "block w-full touch-manipulation rounded px-1 py-0.5 whitespace-pre-wrap transition-colors",
                    inline ? "text-center" : "text-left",
                    isSelected
                      ? "bg-primary/15 text-primary"
                      : "hover:bg-muted active:bg-accent"
                  )}
                >
                  {line}
                </button>
              )
            })}
          </div>
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

      {selectedRange ? (
        <div className="border-border bg-background flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2.5">
          <p className="text-muted-foreground text-xs">
            {selectedRange[1] - selectedRange[0] + 1}{" "}
            {selectedRange[1] - selectedRange[0] + 1 === 1
              ? "linha selecionada"
              : "linhas selecionadas"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelection(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleShareSelection}
              className="gap-1.5"
            >
              <MessageCircle className="size-4" />
              Partilhar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
