import * as React from "react"

import { supabase } from "@/lib/supabase"

export interface BadgeCounts {
  gold: number
  silver: number
  bronze: number
}

/**
 * Fetch the visible weekly-listener badge counts for a user. Returns
 * `null` while loading and an all-zero object when the target user has
 * hidden their badges (the RPC handles the visibility filter).
 */
export function useUserBadges(
  userId: string | null | undefined
): BadgeCounts | null {
  const [counts, setCounts] = React.useState<BadgeCounts | null>(null)

  React.useEffect(() => {
    if (!supabase || !userId) {
      setCounts(null)
      return
    }
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase!.rpc("get_user_badges", {
        uid: userId,
      })
      if (cancelled) return
      if (error || !data) {
        setCounts({ gold: 0, silver: 0, bronze: 0 })
        return
      }
      const next: BadgeCounts = { gold: 0, silver: 0, bronze: 0 }
      for (const row of data) {
        if (row.rank === 1) next.gold = Number(row.badge_count)
        else if (row.rank === 2) next.silver = Number(row.badge_count)
        else if (row.rank === 3) next.bronze = Number(row.badge_count)
      }
      setCounts(next)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  return counts
}
