import { BarChart3 } from "lucide-react"
import { Link } from "react-router-dom"

import { FriendsFeed } from "@/components/library/friends-feed"
import { supabaseConfigured } from "@/lib/supabase"

/**
 * Persistent right rail at xl+ that mirrors Spotify's Friend Activity
 * panel. Hidden when Supabase isn't configured (the underlying feed is
 * a no-op in that case).
 */
export function FriendsRail() {
  if (!supabaseConfigured) return null
  return (
    <aside
      aria-label="Atividade de amigos"
      className="bg-background/60 sticky top-0 hidden h-svh w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border px-4 py-4 pb-28 xl:flex"
    >
      <Link
        to="/estatisticas"
        className="bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold shadow-sm transition-colors touch-manipulation"
      >
        <BarChart3 className="size-4" aria-hidden />
        Ver estatísticas
      </Link>
      <FriendsFeed variant="rail" />
    </aside>
  )
}
