import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { cn } from "@workspace/ui/lib/utils"

import type { DailyRow } from "@/hooks/useStats"

interface ActivityChartProps {
  rows: DailyRow[] | null
  loading: boolean
  className?: string
}

const numberFmt = new Intl.NumberFormat("pt-PT")
const monthDayFmt = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "short",
})
const fullDateFmt = new Intl.DateTimeFormat("pt-PT", {
  weekday: "long",
  day: "numeric",
  month: "long",
})

interface ChartRow {
  day: string
  label: string
  fullLabel: string
  count: number
}

export function ActivityChart({ rows, loading, className }: ActivityChartProps) {
  const data = React.useMemo<ChartRow[]>(() => {
    if (!rows) return []
    return rows.map((r) => {
      const d = new Date(r.day)
      return {
        day: r.day,
        label: Number.isNaN(d.getTime()) ? r.day : monthDayFmt.format(d),
        fullLabel: Number.isNaN(d.getTime()) ? r.day : fullDateFmt.format(d),
        count: r.play_count,
      }
    })
  }, [rows])

  if (loading) {
    return (
      <div
        className={cn(
          "bg-muted h-56 animate-pulse rounded-lg",
          className
        )}
      />
    )
  }

  if (data.length === 0) {
    return (
      <div
        className={cn(
          "border-border bg-card text-muted-foreground flex h-56 items-center justify-center rounded-lg border text-sm",
          className
        )}
      >
        Sem dados para mostrar.
      </div>
    )
  }

  return (
    <div className={cn("border-border bg-card rounded-lg border p-3", className)}>
      <ResponsiveContainer width="100%" height={224}>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 4, left: -16 }}
        >
          <defs>
            <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            stroke="var(--muted-foreground)"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            stroke="var(--muted-foreground)"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            width={32}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
            content={(props: unknown) => (
              <ActivityTooltip {...(props as ActivityTooltipProps)} />
            )}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#activityFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

interface ActivityTooltipProps {
  active?: boolean
  payload?: Array<{ payload?: ChartRow }>
}

function ActivityTooltip({ active, payload }: ActivityTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload
  if (!point) return null
  return (
    <div className="border-border bg-card rounded-md border px-3 py-2 shadow-md">
      <p className="text-muted-foreground mb-0.5 text-xs uppercase tracking-wider">
        {point.fullLabel}
      </p>
      <p className="text-foreground text-sm tabular-nums">
        {numberFmt.format(point.count)}
        <span className="text-muted-foreground ml-1 text-xs">reproduções</span>
      </p>
    </div>
  )
}
