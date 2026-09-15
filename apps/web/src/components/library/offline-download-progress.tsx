import { Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import type { OfflineDownloadProgress } from "@/hooks/useOfflineDownload"
import { formatBytes } from "@/lib/format"

interface OfflineDownloadProgressBarProps {
  progress: OfflineDownloadProgress
  targetBytes: number
  onCancel: () => void
  className?: string
}

/**
 * Inline "downloading N/M — x MB / y MB" progress bar with a cancel
 * button. Shared between the bulk Storage section and any per-playlist
 * download UI so both read from the same `useOfflineDownload` progress
 * shape and render it identically.
 */
export function OfflineDownloadProgressBar({
  progress,
  targetBytes,
  onCancel,
  className,
}: OfflineDownloadProgressBarProps) {
  const doneBytes = progress.cumulativeBytes + progress.receivedBytes
  const pct = Math.min(100, (doneBytes / Math.max(1, targetBytes)) * 100)

  return (
    <div className={className ? `flex flex-col gap-2 ${className}` : "flex flex-col gap-2"}>
      <div className="text-foreground flex items-center gap-2 text-xs">
        <Loader2 className="text-muted-foreground size-3.5 shrink-0 animate-spin" />
        <span className="min-w-0 truncate">
          <span className="text-muted-foreground">
            {progress.index + 1} / {progress.total} ·{" "}
          </span>
          {progress.song.title}
        </span>
      </div>
      <div className="text-muted-foreground text-xs tabular-nums">
        {formatBytes(doneBytes)} / {formatBytes(targetBytes)}
      </div>
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className="text-muted-foreground hover:text-foreground self-start px-0"
      >
        Cancelar
      </Button>
    </div>
  )
}
