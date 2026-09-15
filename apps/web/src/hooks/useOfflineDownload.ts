import * as React from "react"

import {
  downloadSong,
  inspectCache,
  isLikelyCellular,
  markOptedIntoOffline,
  requestPersistence,
} from "@/lib/audio-cache"
import type { Song } from "@/lib/types"

export interface OfflineDownloadProgress {
  /** Index in `targets` currently downloading (0-based). */
  index: number
  /** Total songs to download in this run. */
  total: number
  /** Current song being downloaded. */
  song: Song
  /** Bytes received for the current song. */
  receivedBytes: number
  /** Bytes total for the current song. */
  totalBytes: number
  /** Cumulative bytes downloaded across all songs in this run. */
  cumulativeBytes: number
}

export interface UseOfflineDownloadResult {
  /** Set of song ids (from the input list) currently in the audio cache. */
  cachedIds: Set<string>
  /** Cached ids whose modifiedTime no longer matches — need a re-download. */
  staleIds: Map<string, string>
  /** Songs from the input list that aren't cached, or are cached but stale. */
  targets: Song[]
  /** Total bytes across `targets`. */
  targetBytes: number
  /** Progress snapshot while a download run is active, else null. */
  downloading: OfflineDownloadProgress | null
  /** Message from the most recent failed download, if any. */
  error: string | null
  /** Kick off downloading every target song, bypassing the cellular check. No-op if already running or nothing to do. */
  start: () => Promise<void>
  /**
   * The "download" button should call THIS, not `start` directly — runs
   * immediately on wifi/unknown connections, or opens the cellular
   * confirmation (see `confirmingCellular`) first on a metered one.
   */
  requestStart: () => void
  /** True while the cellular-data confirmation should be shown. */
  confirmingCellular: boolean
  /** User chose to download anyway on cellular — closes the confirmation and starts. */
  confirmCellularDownload: () => void
  /** User backed out of the cellular confirmation without downloading. */
  cancelCellularConfirm: () => void
  /** Stop after the song currently in flight finishes. */
  cancel: () => void
  /** Re-inspect the cache against the current song list (e.g. after an external eviction). */
  refresh: () => Promise<void>
}

/**
 * Shared logic for "download these songs so they work offline" — used by
 * the bulk library-wide Storage section and by per-playlist downloads.
 * Owns cache inspection (what's already downloaded / stale), the
 * download-with-progress loop, cancellation, AND the cellular-data
 * confirmation gate (every caller needs the exact same "are you sure,
 * you're on mobile data" check before a multi-song download, so it lives
 * here rather than being re-implemented per call site). Callers still own
 * their own progress/button UI — just not this specific decision.
 */
export function useOfflineDownload(songs: Song[]): UseOfflineDownloadResult {
  const [cachedIds, setCachedIds] = React.useState<Set<string>>(new Set())
  const [staleIds, setStaleIds] = React.useState<Map<string, string>>(new Map())
  const [downloading, setDownloading] =
    React.useState<OfflineDownloadProgress | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const cancelledRef = React.useRef(false)
  const runningRef = React.useRef(false)

  const refresh = React.useCallback(async () => {
    const manifest = new Map(songs.map((s) => [s.id, s.modifiedTime]))
    const stats = await inspectCache(manifest)
    setCachedIds(stats.cachedIds)
    setStaleIds(stats.staleIds)
  }, [songs])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const targets = React.useMemo(
    () => songs.filter((s) => !cachedIds.has(s.id) || staleIds.has(s.id)),
    [songs, cachedIds, staleIds]
  )

  const targetBytes = React.useMemo(
    () => targets.reduce((acc, s) => acc + (s.size || 0), 0),
    [targets]
  )

  const start = React.useCallback(async () => {
    if (runningRef.current || targets.length === 0) return
    runningRef.current = true
    setError(null)
    cancelledRef.current = false
    await requestPersistence()

    const total = targets.length
    let cumulativeBytes = 0
    const first = targets[0]
    if (!first) {
      runningRef.current = false
      return
    }
    setDownloading({
      index: 0,
      total,
      song: first,
      receivedBytes: 0,
      totalBytes: first.size ?? 0,
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
            song,
            receivedBytes: p.received,
            totalBytes: p.total || song.size || 0,
            cumulativeBytes,
          })
        })
        cumulativeBytes += song.size || 0
        markOptedIntoOffline()
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
          `Falhou em "${song.title}": ${err instanceof Error ? err.message : String(err)}`
        )
        cancelledRef.current = true
        break
      }
    }

    setDownloading(null)
    runningRef.current = false
    await refresh()
  }, [targets, refresh])

  const cancel = React.useCallback(() => {
    cancelledRef.current = true
  }, [])

  const [confirmingCellular, setConfirmingCellular] = React.useState(false)

  const requestStart = React.useCallback(() => {
    if (runningRef.current || targets.length === 0) return
    if (isLikelyCellular()) {
      setConfirmingCellular(true)
      return
    }
    void start()
  }, [targets, start])

  const confirmCellularDownload = React.useCallback(() => {
    setConfirmingCellular(false)
    void start()
  }, [start])

  const cancelCellularConfirm = React.useCallback(() => {
    setConfirmingCellular(false)
  }, [])

  return {
    cachedIds,
    staleIds,
    targets,
    targetBytes,
    downloading,
    error,
    start,
    requestStart,
    confirmingCellular,
    confirmCellularDownload,
    cancelCellularConfirm,
    cancel,
    refresh,
  }
}
