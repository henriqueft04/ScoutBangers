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
      className="bg-background/60 sticky top-0 hidden h-svh w-72 shrink-0 overflow-y-auto border-l border-border px-4 py-4 pb-28 xl:block"
    >
      <FriendsFeed variant="rail" />
    </aside>
  )
}
