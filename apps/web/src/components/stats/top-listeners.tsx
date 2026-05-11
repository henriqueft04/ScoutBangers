import { Link } from "react-router-dom"

import { cn } from "@workspace/ui/lib/utils"

import type { ListenerRow } from "@/hooks/useStats"

interface TopListenersProps {
  rows: ListenerRow[] | null
  loading: boolean
}

const numberFmt = new Intl.NumberFormat("pt-PT")

/**
 * Leaderboard of top listeners with bar fills proportional to play count.
 * Avatars + names link out to public profiles. Privacy-respecting:
 * `share_activity = false` users are filtered out at the RPC level.
 */
export function TopListeners({ rows, loading }: TopListenersProps) {
  if (loading) {
    return (
      <ol className="flex flex-col gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <li
            key={i}
            className="bg-muted h-12 animate-pulse rounded-md"
            aria-hidden
          />
        ))}
      </ol>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <p className="text-muted-foreground border-border bg-card rounded-md border px-4 py-6 text-center text-sm">
        Sem ouvintes neste período.
      </p>
    )
  }

  const max = rows[0]?.play_count ?? 1

  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((row, index) => {
        const pct = (row.play_count / max) * 100
        const initials = (row.display_name ?? "?").charAt(0).toUpperCase()
        return (
          <li
            key={row.user_id}
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
              to={`/u/${row.user_id}`}
              className="relative z-10 flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40"
            >
              <span className="text-muted-foreground w-5 shrink-0 text-center text-xs font-semibold tabular-nums">
                {index + 1}
              </span>
              <span className="bg-primary text-primary-foreground inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold">
                {row.avatar_url ? (
                  <img
                    src={row.avatar_url}
                    alt=""
                    className="size-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  initials
                )}
              </span>
              <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
                {row.display_name ?? "Alguém"}
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
