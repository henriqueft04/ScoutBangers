import * as React from "react"
import { createPortal } from "react-dom"
import { HardDrive, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import type { Song } from "@/lib/types"

interface DownloadedSongsModalProps {
  open: boolean
  onClose: () => void
  cachedIds: Set<string>
  songs: Song[]
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * Lists every song currently stored in the offline audio cache.
 * Click outside / X / Escape to close. Includes a footer note
 * explaining that the data lives in the browser's storage rather
 * than a regular file-system folder — there's no path the user can
 * navigate to outside the app.
 */
export function DownloadedSongsModal({
  open,
  onClose,
  cachedIds,
  songs,
}: DownloadedSongsModalProps) {
  React.useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  const cached = songs.filter((s) => cachedIds.has(s.id))
  const totalBytes = cached.reduce((acc, s) => acc + (s.size || 0), 0)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Downloaded songs"
      className="bg-background/80 fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground border-border animate-in slide-in-from-bottom md:slide-in-from-bottom-0 md:fade-in flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border shadow-xl duration-200 ease-out md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
      >
        <header className="border-border flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div className="flex flex-col">
            <h2 className="text-foreground text-base font-semibold tracking-tight">
              Downloaded songs
            </h2>
            <p className="text-muted-foreground text-xs">
              {cached.length} {cached.length === 1 ? "song" : "songs"} · {formatBytes(totalBytes)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {cached.length === 0 ? (
            <div className="text-muted-foreground px-6 py-10 text-center text-sm">
              Nothing downloaded yet. Use the Download button to cache songs
              for offline playback.
            </div>
          ) : (
            <ol className="flex flex-col">
              {cached.map((song) => (
                <li
                  key={song.id}
                  className="border-border flex items-center justify-between gap-3 border-b px-5 py-2.5 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="text-foreground truncate text-sm font-medium">
                      {song.title}
                    </span>
                    {song.artist ? (
                      <span className="text-muted-foreground truncate text-xs">
                        {song.artist}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {formatBytes(song.size)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <footer className="border-border bg-muted/30 text-muted-foreground flex shrink-0 items-start gap-2 border-t px-5 py-3 text-xs">
          <HardDrive className="mt-0.5 size-3.5 shrink-0" />
          <p className="leading-relaxed">
            Stored in this browser's offline cache on this device. Not in a
            regular folder you can browse — clearing browser data or
            uninstalling the app removes the downloads.
          </p>
        </footer>
      </div>
    </div>,
    document.body
  )
}
