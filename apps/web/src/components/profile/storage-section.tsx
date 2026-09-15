import * as React from "react"
import { Download, FolderOpen, HardDrive, Loader2, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { CellularDownloadDialog } from "@/components/library/cellular-download-dialog"
import { OfflineDownloadProgressBar } from "@/components/library/offline-download-progress"
import { useOfflineDownload } from "@/hooks/useOfflineDownload"
import { usePlayer } from "@/hooks/usePlayer"
import { evictAll, evictSong, originUsage } from "@/lib/audio-cache"
import { formatBytes } from "@/lib/format"
import { evictTrackMetadata } from "@/lib/track-metadata"

import { DownloadedSongsModal } from "./downloaded-songs-modal"

/**
 * "Storage" section: lets the user download every song in the library
 * into the browser's Cache API so playback is instant (and works
 * offline) without round-tripping the Drive proxy. Per-song downloads
 * are intentionally out of scope — single bulk action keeps the UX
 * simple.
 *
 * Also exposes a "View downloaded" modal that lists every cached song
 * (so the user can see what they actually have offline) and a
 * cellular warning before kicking off a multi-hundred-MB transfer.
 */
export function StorageSection() {
  const { songs } = usePlayer()
  const {
    cachedIds,
    staleIds,
    targets,
    targetBytes,
    downloading,
    error,
    requestStart,
    confirmingCellular,
    confirmCellularDownload,
    cancelCellularConfirm,
    cancel,
    refresh,
  } = useOfflineDownload(songs)
  const [usage, setUsage] = React.useState<{ usage: number; quota: number } | null>(
    null
  )
  const [evicting, setEvicting] = React.useState(false)
  const [viewOpen, setViewOpen] = React.useState(false)

  // Origin storage usage isn't tracked by the shared hook (it's not
  // specific to "what's downloaded", just a diagnostic total) — refetch
  // whenever the cache contents change, which covers both a download run
  // completing and an external eviction via removeAll/DownloadedSongsModal.
  React.useEffect(() => {
    let cancelled = false
    void originUsage().then((est) => {
      if (!cancelled) setUsage(est)
    })
    return () => {
      cancelled = true
    }
  }, [cachedIds])

  const cachedBytes = React.useMemo(() => {
    let bytes = 0
    for (const song of songs) {
      if (cachedIds.has(song.id)) bytes += song.size || 0
    }
    return bytes
  }, [songs, cachedIds])

  const removeAll = async () => {
    if (downloading) return
    setEvicting(true)
    await evictAll()
    await refresh()
    setEvicting(false)
  }

  const cachedCount = cachedIds.size
  const totalCount = songs.length
  const allCached = cachedCount === totalCount && staleIds.size === 0

  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-md border p-4">
      <header className="flex items-center gap-2">
        <HardDrive className="text-muted-foreground size-4" />
        <h3 className="text-foreground text-sm font-semibold tracking-tight">
          Transferências para offline
        </h3>
      </header>

      <div className="text-muted-foreground text-xs leading-relaxed">
        Transfere todas as músicas para a app as reproduzir instantaneamente
        a partir do teu dispositivo — sem streaming, funciona offline.
      </div>

      <div className="text-foreground flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="font-semibold tabular-nums">{cachedCount}</span>
          <span className="text-muted-foreground"> / {totalCount} músicas</span>
        </span>
        <span className="text-muted-foreground tabular-nums">
          {formatBytes(cachedBytes)} usados
        </span>
        {usage && usage.quota > 0 ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            ({formatBytes(usage.usage)} de {formatBytes(usage.quota)} disponíveis)
          </span>
        ) : null}
        {staleIds.size > 0 ? (
          <span className="text-primary text-xs">
            {staleIds.size} {staleIds.size === 1 ? "precisa de atualização" : "precisam de atualização"}
          </span>
        ) : null}
      </div>

      {downloading ? (
        <OfflineDownloadProgressBar
          progress={downloading}
          targetBytes={targetBytes}
          onCancel={cancel}
        />
      ) : null}

      {error ? (
        <div className="text-destructive text-xs">{error}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={requestStart}
          disabled={Boolean(downloading) || targets.length === 0}
          className="gap-2"
        >
          {downloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {allCached
            ? "Tudo transferido"
            : `Transferir ${targets.length} ${
                targets.length === 1 ? "música" : "músicas"
              } (${formatBytes(targetBytes)})`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setViewOpen(true)}
          className="text-muted-foreground hover:text-foreground gap-2"
          aria-label="Ver músicas transferidas"
        >
          <FolderOpen className="size-4" />
          Ver ({cachedCount})
        </Button>
        {cachedCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={removeAll}
            disabled={Boolean(downloading) || evicting}
            className="text-muted-foreground hover:text-destructive gap-2"
          >
            {evicting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Remover tudo
          </Button>
        ) : null}
      </div>

      <DownloadedSongsModal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        cachedIds={cachedIds}
        songs={songs}
        onEvict={async (songId) => {
          await evictSong(songId)
          await evictTrackMetadata(songId)
          await refresh()
        }}
      />
      <CellularDownloadDialog
        open={confirmingCellular}
        targetBytes={targetBytes}
        onConfirm={confirmCellularDownload}
        onCancel={cancelCellularConfirm}
      />
    </section>
  )
}
