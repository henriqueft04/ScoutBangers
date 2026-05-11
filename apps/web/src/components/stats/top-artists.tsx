import { Link } from "react-router-dom"

import { cn } from "@workspace/ui/lib/utils"

import type { ArtistRow } from "@/hooks/useStats"

interface TopArtistsProps {
  rows: ArtistRow[] | null
  loading: boolean
}

const numberFmt = new Intl.NumberFormat("pt-PT")

export function TopArtists({ rows, loading }: TopArtistsProps) {
  if (loading) {
    return (
      <ol className="flex flex-col gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <li
            key={i}
            className="bg-muted h-10 animate-pulse rounded-md"
            aria-hidden
          />
        ))}
      </ol>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <p className="text-muted-foreground border-border bg-card rounded-md border px-4 py-6 text-center text-sm">
        Ainda sem dados de artistas.
      </p>
    )
  }

  const max = rows[0]?.play_count ?? 1

  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((row, index) => {
        const pct = (row.play_count / max) * 100
        return (
          <li
            key={row.artist}
            className={cn(
              "border-border bg-card relative overflow-hidden rounded-md border"
            )}
          >
            <div
              aria-hidden
              className="bg-primary/10 absolute inset-y-0 left-0"
              style={{ width: `${pct}%` }}
            />
            <Link
              to={`/artist/${encodeURIComponent(row.artist)}`}
              className="relative z-10 flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40"
            >
              <span className="text-muted-foreground w-5 shrink-0 text-center text-xs font-semibold tabular-nums">
                {index + 1}
              </span>
              <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
                {row.artist}
              </span>
              <span className="text-foreground shrink-0 text-sm tabular-nums">
                {numberFmt.format(row.play_count)}
                <span className="text-muted-foreground ml-1 text-xs">
                  reproduções
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
