import { cn } from "@workspace/ui/lib/utils"

import type { RegionRow } from "@/hooks/useStats"

interface ListenersByRegionProps {
  rows: RegionRow[] | null
  loading: boolean
}

const numberFmt = new Intl.NumberFormat("pt-PT")

export function ListenersByRegion({ rows, loading }: ListenersByRegionProps) {
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
        Sem dados de regiões neste período.
      </p>
    )
  }

  const max = rows[0]?.play_count ?? 1

  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((row, index) => {
        const pct = (row.play_count / max) * 100
        const label = row.nucleo ? `${row.regiao} — ${row.nucleo}` : row.regiao
        return (
          <li
            key={`${row.regiao}-${row.nucleo ?? ""}`}
            className={cn(
              "border-border bg-card relative overflow-hidden rounded-md border"
            )}
          >
            <div
              aria-hidden
              className="bg-primary/10 absolute inset-y-0 left-0"
              style={{ width: `${pct}%` }}
            />
            <div className="relative z-10 flex items-center gap-3 px-3 py-2">
              <span className="text-muted-foreground w-5 shrink-0 text-center text-xs font-semibold tabular-nums">
                {index + 1}
              </span>
              <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
                {label}
              </span>
              <span className="text-foreground shrink-0 text-sm tabular-nums">
                {numberFmt.format(row.play_count)}
                <span className="text-muted-foreground ml-1 text-xs">
                  reproduções
                </span>
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
