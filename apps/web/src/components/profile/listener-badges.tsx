import * as React from "react"
import { createPortal } from "react-dom"
import { Loader2, Medal, Trophy, X } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import type { BadgeCounts } from "@/hooks/useUserBadges"
import { supabase } from "@/lib/supabase"

interface ListenerBadgesProps {
  userId: string | null | undefined
  counts: BadgeCounts | null
}

type Tier = {
  key: keyof BadgeCounts
  rank: 1 | 2 | 3
  label: string
  count: number
  color: string
}

interface WeekRow {
  week_start: string
  play_count: number
}

const formatWeek = (iso: string) => {
  const start = new Date(iso + "T00:00:00")
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const dayMonth = new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "long",
  })
  const full = new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  // Same month → "12 a 18 de maio de 2026"
  // Crosses months → "28 de abril a 4 de maio de 2026"
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} a ${end.getDate()} de ${full.format(end).replace(/^\d+\s*de\s*/, "")}`
  }
  return `${dayMonth.format(start)} a ${full.format(end)}`
}

/**
 * Renders the weekly top-3 listener badges for a profile. Clicking a
 * medal opens a modal listing every week it was earned. Returns null
 * when the user has no visible badges so the section disappears.
 */
export function ListenerBadges({ userId, counts }: ListenerBadgesProps) {
  const [openTier, setOpenTier] = React.useState<Tier | null>(null)

  if (!counts || !userId) return null
  const total = counts.gold + counts.silver + counts.bronze
  if (total === 0) return null

  const tiers: Tier[] = [
    { key: "gold", rank: 1, label: "1.º lugar", count: counts.gold, color: "text-amber-400" },
    { key: "silver", rank: 2, label: "2.º lugar", count: counts.silver, color: "text-slate-300" },
    { key: "bronze", rank: 3, label: "3.º lugar", count: counts.bronze, color: "text-amber-700" },
  ]

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs uppercase tracking-wider">
        Distinções semanais
      </h3>
      <ul role="list" className="flex flex-wrap gap-2">
        {tiers
          .filter((tier) => tier.count > 0)
          .map((tier) => (
            <li key={tier.key}>
              <button
                type="button"
                onClick={() => setOpenTier(tier)}
                className="border-border bg-card hover:bg-accent/40 flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors"
                aria-label={`Ver semanas do ${tier.label}`}
              >
                {tier.rank === 1 ? (
                  <Trophy className={cn("size-4", tier.color)} />
                ) : (
                  <Medal className={cn("size-4", tier.color)} />
                )}
                <span className="text-foreground text-sm font-medium">
                  {tier.label}
                </span>
                <span className="text-muted-foreground text-xs">
                  ×{tier.count}
                </span>
              </button>
            </li>
          ))}
      </ul>

      <BadgeWeeksModal
        userId={userId}
        tier={openTier}
        onClose={() => setOpenTier(null)}
      />
    </section>
  )
}

interface BadgeWeeksModalProps {
  userId: string
  tier: Tier | null
  onClose: () => void
}

function BadgeWeeksModal({ userId, tier, onClose }: BadgeWeeksModalProps) {
  const [weeks, setWeeks] = React.useState<WeekRow[] | null>(null)

  React.useEffect(() => {
    if (!tier || !supabase) {
      setWeeks(null)
      return
    }
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase!.rpc("get_user_badge_weeks", {
        uid: userId,
        rank_in: tier.rank,
      })
      if (cancelled) return
      setWeeks(error || !data ? [] : data)
    })()
    return () => {
      cancelled = true
    }
  }, [tier, userId])

  React.useEffect(() => {
    if (!tier) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [tier, onClose])

  if (!tier) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Semanas de ${tier.label}`}
      className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground border-border animate-in fade-in zoom-in-95 flex max-h-[80vh] w-full max-w-sm flex-col rounded-2xl border shadow-xl duration-200 ease-out"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            {tier.rank === 1 ? (
              <Trophy className={cn("size-5", tier.color)} />
            ) : (
              <Medal className={cn("size-5", tier.color)} />
            )}
            <h2 className="text-foreground text-base font-semibold tracking-tight">
              {tier.label} — {tier.count}{" "}
              {tier.count === 1 ? "semana" : "semanas"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-md p-1"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="overflow-y-auto px-6 pb-6">
          {weeks === null ? (
            <Loader2 className="text-muted-foreground mx-auto my-6 size-5 animate-spin" />
          ) : weeks.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Sem semanas para mostrar.
            </p>
          ) : (
            <ul role="list" className="flex flex-col divide-y divide-border/60">
              {weeks.map((week) => (
                <li
                  key={week.week_start}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="text-foreground text-sm font-medium">
                    {formatWeek(week.week_start)}
                  </span>
                  <span className="text-foreground flex items-baseline gap-1 tabular-nums">
                    <span className="text-base font-semibold">
                      {week.play_count}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {week.play_count === 1 ? "reprodução" : "reproduções"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
