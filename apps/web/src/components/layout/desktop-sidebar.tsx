import { Home, Info, ListMusic, Music2, User } from "lucide-react"
import { Link, NavLink } from "react-router-dom"

import { cn } from "@workspace/ui/lib/utils"

interface NavItem {
  to: string
  label: string
  Icon: typeof Home
}

const ITEMS: ReadonlyArray<NavItem> = [
  { to: "/", label: "Início", Icon: Home },
  { to: "/music", label: "Músicas", Icon: Music2 },
  { to: "/playlists", label: "Playlists", Icon: ListMusic },
  { to: "/profile", label: "Perfil", Icon: User },
  { to: "/sobre", label: "Sobre", Icon: Info },
]

/**
 * Persistent left rail at lg+. Replaces the bottom nav on desktop and
 * also hosts the brand mark so the top header can shed its logo and
 * keep just the user actions.
 */
export function DesktopSidebar() {
  return (
    <aside
      aria-label="Navegação"
      className="bg-background/60 sticky top-0 hidden h-svh w-56 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border px-3 py-4 pb-28 lg:flex"
    >
      <Link
        to="/"
        className="flex items-center gap-2 rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <img
          src="/icon-header.png"
          alt=""
          width={36}
          height={36}
          className="h-9 w-auto rounded-md"
        />
        <span className="text-foreground text-base font-semibold tracking-tight">
          ScoutBangers
        </span>
      </Link>

      <nav aria-label="Principal" className="mt-2 flex flex-col gap-1">
        {ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                isActive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )
            }
          >
            <Icon className="size-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
