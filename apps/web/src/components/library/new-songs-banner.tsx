import * as React from "react"
import { Download, X } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { usePlayer } from "@/hooks/usePlayer"
import { hasOptedIntoOffline, inspectCache } from "@/lib/audio-cache"

const DISMISSED_KEY = "scoutbangers:offline:new-songs-dismissed-mtime"

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * Shown once a user has opted into offline downloads (i.e. has any
 * cached song) AND new uncached songs are now available on Drive.
 * One-tap link to the Profile page where they can hit Download.
 *
 * Dismiss persists per the latest manifest hash so the banner
 * doesn't keep coming back for the same set of songs the user
 * actively chose to ignore — but it returns the next time genuinely
 * new songs land.
 */
export function NewSongsBanner() {
  const { songs } = usePlayer()
  const navigate = useNavigate()
  const [count, setCount] = React.useState(0)
  const [bytes, setBytes] = React.useState(0)
  const [maxMtime, setMaxMtime] = React.useState<string | null>(null)
  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    if (typeof localStorage === "undefined") return
    if (!hasOptedIntoOffline()) return
    if (songs.length === 0) return

    const manifest = new Map(songs.map((s) => [s.id, s.modifiedTime]))
    void inspectCache(manifest).then((stats) => {
      if (cancelled) return
      // Don't run on the very-first install (no cache yet means the
      // user hasn't actually opted in, even if the flag was set
      // optimistically by something else).
      if (stats.cachedIds.size === 0) return

      const uncached = songs.filter((s) => !stats.cachedIds.has(s.id))
      if (uncached.length === 0) {
        setCount(0)
        return
      }

      const newest = uncached
        .map((s) => s.modifiedTime)
        .sort()
        .pop() ?? null
      const last = localStorage.getItem(DISMISSED_KEY)
      if (last && newest && last >= newest) {
        // User already dismissed for this batch.
        setCount(0)
        return
      }

      setCount(uncached.length)
      setBytes(uncached.reduce((acc, s) => acc + (s.size || 0), 0))
      setMaxMtime(newest)
      setDismissed(false)
    })

    return () => {
      cancelled = true
    }
  }, [songs])

  if (count === 0 || dismissed) return null

  const dismiss = () => {
    if (maxMtime && typeof localStorage !== "undefined") {
      localStorage.setItem(DISMISSED_KEY, maxMtime)
    }
    setDismissed(true)
  }

  return (
    <div
      role="status"
      className="border-border bg-card flex items-center gap-3 border-b px-3 py-2 text-sm md:px-6"
    >
      <Download className="text-primary size-4 shrink-0" />
      <div className="text-foreground min-w-0 flex-1 truncate">
        {count} new {count === 1 ? "song" : "songs"} available ·{" "}
        <span className="text-muted-foreground tabular-nums">
          {formatBytes(bytes)}
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        className="shrink-0"
        onClick={() => {
          dismiss()
          navigate("/profile")
        }}
      >
        Download
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss"
        onClick={dismiss}
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <X />
      </Button>
    </div>
  )
}
