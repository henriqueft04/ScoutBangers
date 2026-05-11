import { Activity, ListMusic, TrendingUp, Users } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import type { StatsPeriod, SummaryRow } from "@/hooks/useStats"

interface SummaryCardsProps {
  data: SummaryRow | null
  loading: boolean
  period: StatsPeriod
}

const PERIOD_LABEL: Record<StatsPeriod, string> = {
  week: "Esta semana",
  month: "Este mês",
  all: "Sempre",
}

const numberFmt = new Intl.NumberFormat("pt-PT")

function formatBiggestDay(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "short",
  }).format(date)
}

export function SummaryCards({ data, loading, period }: SummaryCardsProps) {
  const cards = [
    {
      label: "Reproduções",
      value: data ? numberFmt.format(data.total_plays) : "—",
      sub: PERIOD_LABEL[period],
      Icon: Activity,
    },
    {
      label: "Músicas únicas",
      value: data ? numberFmt.format(data.unique_songs) : "—",
      sub: "diferentes",
      Icon: ListMusic,
    },
    {
      label: "Artistas únicos",
      value: data ? numberFmt.format(data.unique_artists) : "—",
      sub: "diferentes",
      Icon: Users,
    },
    {
      label: "Maior dia",
      value: data ? formatBiggestDay(data.biggest_day) : "—",
      sub: data?.biggest_day_count
        ? `${numberFmt.format(data.biggest_day_count)} reproduções`
        : "—",
      Icon: TrendingUp,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, value, sub, Icon }) => (
        <div
          key={label}
          className={cn(
            "border-border bg-card flex flex-col gap-2 rounded-lg border p-4"
          )}
        >
          <div className="text-muted-foreground flex items-center justify-between text-xs uppercase tracking-wider">
            <span>{label}</span>
            <Icon className="size-4 opacity-70" aria-hidden />
          </div>
          {loading ? (
            <div className="bg-muted h-7 w-20 animate-pulse rounded" />
          ) : (
            <p className="text-foreground text-2xl font-semibold tracking-tight">
              {value}
            </p>
          )}
          <p className="text-muted-foreground text-xs">{sub}</p>
        </div>
      ))}
    </div>
  )
}
