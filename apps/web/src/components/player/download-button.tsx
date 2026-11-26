import * as React from "react"
import { Check, CircleAlert, CloudDownload, Download, FileDown, Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { CellularDownloadDialog } from "@/components/library/cellular-download-dialog"
import { useOfflineDownload } from "@/hooks/useOfflineDownload"
import { saveSongToDevice } from "@/lib/song-download"
import { displayTitle } from "@/lib/song-display"
import type { Song } from "@/lib/types"

interface DownloadButtonProps {
  song: Song
  className?: string
}

const OPTION_CLASS =
  "hover:bg-accent touch-manipulation flex w-full items-center gap-3 rounded-md px-3 py-3 text-left disabled:opacity-60 disabled:hover:bg-transparent"

/**
 * One button, two different things: keep the song inside the app to play
 * without internet ("offline", the same cache the Profile's Transferências
 * and the playlist downloads use), or save the song's original file to the
 * device. Render it with `key={song.id}` so a busy or failed state never
 * carries over to another song.
 */
export function DownloadButton({ song, className }: DownloadButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState<"idle" | "busy" | "error">("idle")

  // A stable one-item array: a new identity would make useOfflineDownload
  // re-inspect the cache on every render.
  const songs = React.useMemo(() => [song], [song])
  const offline = useOfflineDownload(songs)
  const isOffline = offline.targets.length === 0
  const offlineBusy = Boolean(offline.downloading)

  const busy = offlineBusy || saving === "busy"
  const failed = Boolean(offline.error) || saving === "error"

  const keepOffline = () => {
    setOpen(false)
    offline.requestStart()
  }

  const saveFile = async () => {
    setOpen(false)
    setSaving("busy")
    try {
      await saveSongToDevice(song.id, displayTitle(song))
      setSaving("idle")
    } catch {
      setSaving("error")
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={failed ? "Falha ao transferir — toca para tentar de novo" : "Transferir música"}
        onClick={() => setOpen(true)}
        disabled={busy}
        className={cn("touch-manipulation size-10", failed && "text-destructive", className)}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin" />
        ) : failed ? (
          <CircleAlert className="size-5" />
        ) : (
          <Download className="size-5" />
        )}
      </Button>
      <BottomSheet open={open} title="Transferir música" onClose={() => setOpen(false)}>
        <ul className="flex flex-col gap-1">
          <li>
            <button
              type="button"
              onClick={keepOffline}
              disabled={isOffline}
              className={cn(OPTION_CLASS, isOffline && "text-primary")}
            >
              <CloudDownload className="size-5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block">Disponibilizar offline</span>
                <span className="text-muted-foreground block text-xs">
                  {isOffline
                    ? "Já está disponível offline"
                    : "Fica guardada na app para ouvires sem internet"}
                </span>
              </span>
              {isOffline ? <Check className="size-4 shrink-0" /> : null}
            </button>
          </li>
          <li>
            <button type="button" onClick={() => void saveFile()} className={OPTION_CLASS}>
              <FileDown className="size-5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block">Transferir para o dispositivo</span>
                <span className="text-muted-foreground block text-xs">
                  Guarda o ficheiro original no teu aparelho
                </span>
              </span>
            </button>
          </li>
        </ul>
      </BottomSheet>
      <CellularDownloadDialog
        open={offline.confirmingCellular}
        targetBytes={offline.targetBytes}
        onConfirm={offline.confirmCellularDownload}
        onCancel={offline.cancelCellularConfirm}
      />
    </>
  )
}
