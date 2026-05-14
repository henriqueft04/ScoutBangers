import { Home, Info, ListMusic, Music2, User } from "lucide-react"

/**
 * The primary navigation entries shared by the mobile bottom nav and
 * the desktop sidebar. Both surfaces render the same routes in the
 * same order with the same labels and tour anchors — keeping a single
 * source of truth means adding a route (or renaming one) is one edit,
 * and the tour selectors stay in sync with whichever surface is in
 * the DOM at a given viewport.
 */
export interface NavItem {
  to: string
  label: string
  Icon: typeof Home
  /** Value of the `data-tour-id` attribute the engine looks up. */
  tourId: string
}

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { to: "/", label: "Início", Icon: Home, tourId: "nav-home" },
  { to: "/music", label: "Músicas", Icon: Music2, tourId: "nav-music" },
  { to: "/playlists", label: "Playlists", Icon: ListMusic, tourId: "nav-playlists" },
  { to: "/profile", label: "Perfil", Icon: User, tourId: "nav-profile" },
  { to: "/sobre", label: "Sobre", Icon: Info, tourId: "nav-about" },
]
