import * as React from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { cn } from "@workspace/ui/lib/utils"

import type { WeeklySongRow } from "@/hooks/useStats"
import type { Song } from "@/lib/types"

interface BumpChartProps {
  rows: WeeklySongRow[] | null
  loading: boolean
  songsById: Map<string, Song>
  className?: string
}

/**
 * 10 distinct colors picked for both light (#F0F3F5) and dark (#1A1110)
 * backgrounds. Avoid pure red because the project's primary is already
 * a deep red — songs would visually merge with chrome.
 */
const PALETTE = [
  "#7b2d26",
  "#d97757",
  "#c4a01a",
  "#7ea73d",
  "#2c8c70",
  "#3a8fb7",
  "#7861c2",
  "#a14fa1",
  "#c2496e",
  "#7a6f63",
] as const

interface PivotedRow {
  week_start: string
  weekLabel: string
  [songId: string]: number | string | null
}

function pivot(
  rows: WeeklySongRow[],
  songsById: Map<string, Song>
): {
  data: PivotedRow[]
  songIds: string[]
  titleFor: Map<string, string>
} {
  const weekMap = new Map<string, PivotedRow>()
  const songIdSet = new Set<string>()

  for (const row of rows) {
    songIdSet.add(row.song_id)
    let entry = weekMap.get(row.week_start)
    if (!entry) {
      entry = {
        week_start: row.week_start,
        weekLabel: formatWeek(row.week_start),
      }
      weekMap.set(row.week_start, entry)
    }
    entry[row.song_id] = row.rank
  }

  const data = Array.from(weekMap.values()).sort((a, b) =>
    a.week_start.localeCompare(b.week_start)
  )

  // Stable order by total presence (most weeks first), then by best rank.
  const presence = new Map<string, { weeks: number; bestRank: number }>()
  for (const row of rows) {
    const cur = presence.get(row.song_id) ?? { weeks: 0, bestRank: 11 }
    cur.weeks += 1
    if (row.rank < cur.bestRank) cur.bestRank = row.rank
    presence.set(row.song_id, cur)
  }
  const songIds = Array.from(songIdSet).sort((a, b) => {
    const ap = presence.get(a)!
    const bp = presence.get(b)!
    if (bp.weeks !== ap.weeks) return bp.weeks - ap.weeks
    return ap.bestRank - bp.bestRank
  })

  const titleFor = new Map<string, string>()
  for (const id of songIds) {
    const song = songsById.get(id)
    titleFor.set(id, song?.title ?? "(música indisponível)")
  }

  return { data, songIds, titleFor }
}

function formatWeek(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
  }).format(d)
}

export function BumpChart({
  rows,
  loading,
  songsById,
  className,
}: BumpChartProps) {
  const { data, songIds, titleFor } = React.useMemo(
    () => pivot(rows ?? [], songsById),
    [rows, songsById]
  )

  if (loading) {
    return (
      <div className={cn("bg-muted h-72 animate-pulse rounded-lg", className)} />
    )
  }

  if (data.length === 0 || songIds.length === 0) {
    return (
      <div
        className={cn(
          "border-border bg-card text-muted-foreground flex h-72 items-center justify-center rounded-lg border text-sm",
          className
        )}
      >
        Ainda sem reproduções suficientes para gerar o gráfico.
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="border-border bg-card rounded-lg border p-3">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={data}
            margin={{ top: 12, right: 12, bottom: 4, left: -16 }}
          >
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="weekLabel"
              stroke="var(--muted-foreground)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              reversed
              domain={[1, 10]}
              ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
              stroke="var(--muted-foreground)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              width={32}
              label={{
                value: "Posição",
                angle: -90,
                position: "insideLeft",
                style: { fill: "var(--muted-foreground)", fontSize: 11 },
                offset: 16,
              }}
            />
            <Tooltip
              content={(props: unknown) => (
                <BumpTooltip
                  {...(props as RechartsTooltipShape)}
                  titleFor={titleFor}
                />
              )}
              cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
            />
            {songIds.map((id, i) => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--background)" }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <BumpLegend
        songIds={songIds}
        titleFor={titleFor}
      />
    </div>
  )
}

interface BumpLegendProps {
  songIds: string[]
  titleFor: Map<string, string>
}

function BumpLegend({ songIds, titleFor }: BumpLegendProps) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {songIds.map((id, i) => (
        <li key={id} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: PALETTE[i % PALETTE.length] }}
          />
          <span className="text-foreground max-w-[14rem] truncate">
            {titleFor.get(id)}
          </span>
        </li>
      ))}
    </ul>
  )
}

interface RechartsTooltipShape {
  active?: boolean
  label?: string | number
  payload?: Array<{
    dataKey?: string | number
    value?: number | string
    color?: string
  }>
}

interface BumpTooltipProps extends RechartsTooltipShape {
  titleFor: Map<string, string>
}

function BumpTooltip({ active, payload, label, titleFor }: BumpTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const sorted = [...payload]
    .filter((p) => typeof p.value === "number")
    .sort((a, b) => (a.value as number) - (b.value as number))
  return (
    <div className="border-border bg-card rounded-md border px-3 py-2 shadow-md">
      <p className="text-muted-foreground mb-1 text-xs uppercase tracking-wider">
        {label}
      </p>
      <ul className="space-y-1 text-xs">
        {sorted.map((p) => (
          <li key={p.dataKey as string} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: p.color }}
            />
            <span className="text-foreground max-w-[14rem] truncate">
              {titleFor.get(p.dataKey as string) ?? p.dataKey}
            </span>
            <span className="text-muted-foreground ml-auto">#{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
