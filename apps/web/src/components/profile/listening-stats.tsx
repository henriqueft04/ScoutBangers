import { Clock, Music2 } from "lucide-react"

import type { UserListeningStats } from "@/hooks/useTopStats"

interface ListeningStatsProps {
  stats: UserListeningStats | null
}

const numberFmt = new Intl.NumberFormat("pt-PT")

function breakdownTime(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return { days, hours, minutes }
}

export function ListeningStats({ stats }: ListeningStatsProps) {
  const { days, hours, minutes } = stats
    ? breakdownTime(stats.totalSeconds)
    : { days: 0, hours: 0, minutes: 0 }

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Tempo ouvido */}
      <div className="border-border bg-card rounded-lg border px-4 py-3">
        <div className="text-muted-foreground mb-2 flex items-center justify-center gap-1.5 text-xs">
          <Clock className="size-3.5" aria-hidden />
          <span>Tempo ouvido</span>
        </div>
        <div className="flex items-end justify-around gap-2">
          {[
            { value: days, label: "DIAS" },
            { value: hours, label: "HORAS" },
            { value: minutes, label: "MIN" },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <span className="text-foreground text-2xl font-semibold tabular-nums leading-none">
                {numberFmt.format(value)}
              </span>
              <span className="text-muted-foreground text-[9px] font-medium uppercase tracking-widest">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Músicas ouvidas */}
      <div className="border-border bg-card rounded-lg border px-4 py-3">
        <div className="text-muted-foreground mb-2 flex items-center justify-center gap-1.5 text-xs">
          <Music2 className="size-3.5" aria-hidden />
          <span>Músicas ouvidas</span>
        </div>
        <div className="flex items-end justify-around">
          <div className="flex flex-col items-center gap-1">
            <span className="text-foreground text-2xl font-semibold tabular-nums leading-none">
              {stats ? numberFmt.format(stats.totalPlays) : "0"}
            </span>
            <span className="text-muted-foreground text-[9px] font-medium uppercase tracking-widest">
              TOTAL
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
