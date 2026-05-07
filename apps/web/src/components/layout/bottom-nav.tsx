import { Home, ListMusic, Music2, User } from "lucide-react"
import { NavLink } from "react-router-dom"

import { cn } from "@workspace/ui/lib/utils"

interface NavItem {
  to: string
  label: string
  Icon: typeof Home
}

const ITEMS: ReadonlyArray<NavItem> = [
  { to: "/", label: "Home", Icon: Home },
  { to: "/music", label: "Music", Icon: Music2 },
  { to: "/playlists", label: "Playlists", Icon: ListMusic },
  { to: "/profile", label: "Profile", Icon: User },
]

/**
 * Sticky bottom nav with 4 tabs. Sits below the PlayerBar in the layout
 * stack. Each tab icon swaps to its filled state via aria-current styling.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky inset-x-0 bottom-0 z-30 border-t backdrop-blur",
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <ul className="mx-auto flex w-full max-w-6xl items-stretch justify-around px-2 py-1 md:px-6">
        {ITEMS.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium transition-colors touch-manipulation",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
