import * as React from "react"
import { Download, HardDrive, Loader2, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { usePlayer } from "@/hooks/usePlayer"
import {
  downloadSong,
  evictAll,
  inspectCache,
  requestPersistence,
  originUsage,
} from "@/lib/audio-cache"

interface DownloadState {
  /** Index in `targets` we're currently downloading (0-based). */
  index: number
  /** Total songs to download in this run. */
  total: number
  /** Bytes received for the current song. */
  receivedBytes: number
  /** Bytes total for the current song. */
  totalBytes: number
  /** Cumulative bytes downloaded across all songs in this run. */
  cumulativeBytes: number
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * "Storage" section: lets the user download every song in the library
 * into the browser's Cache API so playback is instant (and works
 * offline) without round-tripping the Drive proxy. Per-song downloads
 * are intentionally out of scope — single bulk action keeps the UX
 * simple.
 */
export function StorageSection() {
  const { songs } = usePlayer()
  const [cachedIds, setCachedIds] = React.useState<Set<string>>(new Set())
  const [staleIds, setStaleIds] = React.useState<Map<string, string>>(new Map())
  const [usage, setUsage] = React.useState<{ usage: number; quota: number } | null>(
    null
  )
  const [downloading, setDownloading] = React.useState<DownloadState | null>(
    null
  )
  const [error, setError] = React.useState<string | null>(null)
  const [evicting, setEvicting] = React.useState(false)
  const cancelledRef = React.useRef(false)

  const refresh = React.useCallback(async () => {
    const manifest = new Map(songs.map((s) => [s.id, s.modifiedTime]))
    const [stats, est] = await Promise.all([inspectCache(manifest), originUsage()])
    setCachedIds(stats.cachedIds)
    setStaleIds(stats.staleIds)
    setUsage(est)
  }, [songs])

  React.useEffect(() => {
    let cancelled = false
    const manifest = new Map(songs.map((s) => [s.id, s.modifiedTime]))
    void Promise.all([inspectCache(manifest), originUsage()]).then(
      ([stats, est]) => {
        if (cancelled) return
        setCachedIds(stats.cachedIds)
        setStaleIds(stats.staleIds)
        setUsage(est)
      }
    )
    return () => {
      cancelled = true
    }
  }, [songs])

  // Songs that need work: not cached at all, OR cached but stale.
  const targets = React.useMemo(() => {
    return songs.filter((s) => !cachedIds.has(s.id) || staleIds.has(s.id))
  }, [songs, cachedIds, staleIds])

  const targetBytes = React.useMemo(
    () => targets.reduce((acc, s) => acc + (s.size || 0), 0),
    [targets]
  )

  const cachedBytes = React.useMemo(() => {
    let bytes = 0
    for (const song of songs) {
      if (cachedIds.has(song.id)) bytes += song.size || 0
    }
    return bytes
  }, [songs, cachedIds])

  const startDownload = async () => {
    if (downloading) return
    if (targets.length === 0) return
    setError(null)
    cancelledRef.current = false
    await requestPersistence()

    const total = targets.length
    let cumulativeBytes = 0
    setDownloading({
      index: 0,
      total,
      receivedBytes: 0,
      totalBytes: targets[0]?.size ?? 0,
      cumulativeBytes,
    })

    for (let i = 0; i < targets.length; i++) {
      if (cancelledRef.current) break
      const song = targets[i]!
      try {
        await downloadSong(song.id, song.modifiedTime, (p) => {
          setDownloading({
            index: i,
            total,
            receivedBytes: p.received,
            totalBytes: p.total || song.size || 0,
            cumulativeBytes,
          })
        })
        cumulativeBytes += song.size || 0
        setCachedIds((prev) => {
          const next = new Set(prev)
          next.add(song.id)
          return next
        })
        setStaleIds((prev) => {
          if (!prev.has(song.id)) return prev
          const next = new Map(prev)
          next.delete(song.id)
          return next
        })
      } catch (err) {
        setError(
          `Failed on "${song.title}": ${err instanceof Error ? err.message : String(err)}`
        )
        cancelledRef.current = true
        break
      }
    }

    setDownloading(null)
    void refresh()
  }

  const cancel = () => {
    cancelledRef.current = true
  }

  const removeAll = async () => {
    if (downloading) return
    setEvicting(true)
    await evictAll()
    setEvicting(false)
    void refresh()
  }

  const cachedCount = cachedIds.size
  const totalCount = songs.length
  const allCached = cachedCount === totalCount && staleIds.size === 0

  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-md border p-4">
      <header className="flex items-center gap-2">
        <HardDrive className="text-muted-foreground size-4" />
        <h3 className="text-foreground text-sm font-semibold tracking-tight">
          Offline downloads
        </h3>
      </header>

      <div className="text-muted-foreground text-xs leading-relaxed">
        Download every song so the app plays them instantly from your
        device — no streaming, works offline.
      </div>

      <div className="text-foreground flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="font-semibold tabular-nums">{cachedCount}</span>
          <span className="text-muted-foreground"> / {totalCount} songs</span>
        </span>
        <span className="text-muted-foreground tabular-nums">
          {formatBytes(cachedBytes)} used
        </span>
        {usage && usage.quota > 0 ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            ({formatBytes(usage.usage)} of {formatBytes(usage.quota)} available)
          </span>
        ) : null}
        {staleIds.size > 0 ? (
          <span className="text-primary text-xs">
            {staleIds.size} need refresh
          </span>
        ) : null}
      </div>

      {downloading ? (
        <div className="flex flex-col gap-2">
          <div className="text-foreground text-xs">
            Downloading {downloading.index + 1} of {downloading.total} ·{" "}
            <span className="tabular-nums">
              {formatBytes(downloading.cumulativeBytes + downloading.receivedBytes)} /{" "}
              {formatBytes(targetBytes)}
            </span>
          </div>
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-all"
              style={{
                width: `${Math.min(
                  100,
                  ((downloading.cumulativeBytes + downloading.receivedBytes) /
                    Math.max(1, targetBytes)) *
                    100
                )}%`,
              }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancel}
            className="text-muted-foreground hover:text-foreground self-start px-0"
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="text-destructive text-xs">{error}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={startDownload}
          disabled={Boolean(downloading) || targets.length === 0}
          className="gap-2"
        >
          {downloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {allCached
            ? "All downloaded"
            : `Download ${targets.length} ${
                targets.length === 1 ? "song" : "songs"
              } (${formatBytes(targetBytes)})`}
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
            Remove all
          </Button>
        ) : null}
      </div>
    </section>
  )
}
