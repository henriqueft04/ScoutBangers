import * as React from "react"
import { Music2, RefreshCw, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useAuth } from "@/hooks/useAuth"
import { useLyrics } from "@/hooks/useLyrics"
import { usePlayer } from "@/hooks/usePlayer"
import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import {
  lyricsLastUpdatedAt,
  refreshLyrics,
} from "@/lib/lyrics"
import { supabase } from "@/lib/supabase"
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
  const { user } = useAuth()
  const lyrics = useLyrics(title ?? undefined)
  const [refreshing, setRefreshing] = React.useState(false)
  const [updatedAt, setUpdatedAt] = React.useState(() => lyricsLastUpdatedAt())
  const [showEditor, setShowEditor] = React.useState(false)
  const [submissionText, setSubmissionText] = React.useState("")
  const [submissionState, setSubmissionState] = React.useState<
    "idle" | "saving" | "submitted"
  >("idle")
  const [submissionError, setSubmissionError] = React.useState<string | null>(null)

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true)
    const next = await refreshLyrics()
    setUpdatedAt(next?.fetchedAt ?? null)
    setRefreshing(false)
  }, [])

  const handleOpenEditor = React.useCallback(() => {
    setShowEditor(true)
    setSubmissionError(null)
    setSubmissionState("idle")
  }, [])

  const handleSendSubmission = React.useCallback(async () => {
    if (!song || !title) return
    const trimmed = submissionText.trim()
    if (!trimmed) {
      setSubmissionError("Escreve a letra antes de submeter.")
      return
    }
    if (!supabase) {
      setSubmissionError(
        "Submissões estão indisponíveis porque o backend não está configurado."
      )
      return
    }

    setSubmissionState("saving")
    setSubmissionError(null)

    const { error: insertError } = await supabase.from("lyrics_submissions").insert({
      user_id: user?.id ?? null,
      song_id: song.id,
      title,
      lyrics: trimmed,
    })

    if (insertError) {
      setSubmissionError(
        "Não foi possível submeter a letra. Tenta novamente mais tarde."
      )
      setSubmissionState("idle")
      return
    }

    setSubmissionState("submitted")
    setShowEditor(false)
    setSubmissionText("")
  }, [song, submissionText, title, user])

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
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-4 py-10 text-center text-sm">
            <Music2 className="size-8 opacity-40" />
            <p>Letra indisponível para esta música.</p>
            <p className="text-xs opacity-80">
              {song
                ? "Se foi adicionada recentemente ao Cancioneiro, atualiza."
                : "Toca uma música para veres a letra."}
            </p>

            {song ? (
              <div className="w-full max-w-2xl rounded-3xl border border-border bg-muted/70 px-4 py-4 text-left text-sm text-foreground shadow-sm sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      Sugere uma letra para esta música
                    </p>
                    <p className="text-xs text-muted-foreground">
                      A letra será verificada manualmente pelo admin.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleOpenEditor}
                  >
                    Submeter letra
                  </Button>
                </div>

                {showEditor ? (
                  <div className="mt-4 space-y-3">
                    <textarea
                      value={submissionText}
                      onChange={(event) => setSubmissionText(event.target.value)}
                      className="min-h-[180px] w-full resize-none rounded-2xl border border-border bg-background px-3 py-3 text-sm leading-relaxed text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="Escreve aqui a letra da música..."
                    />
                    {submissionError ? (
                      <p className="text-destructive text-xs">{submissionError}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={handleSendSubmission}
                        disabled={submissionState === "saving"}
                      >
                        {submissionState === "saving"
                          ? "A enviar..."
                          : "Enviar letra"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowEditor(false)
                          setSubmissionError(null)
                        }}
                        disabled={submissionState === "saving"}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}
                {submissionState === "submitted" ? (
                  <p className="mt-3 text-foreground text-xs">
                    Obrigado! A tua sugestão foi enviada para revisão.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
