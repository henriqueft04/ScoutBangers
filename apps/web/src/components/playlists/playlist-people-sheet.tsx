import * as React from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { UserMinus, UserPlus, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { UserAvatar } from "@/components/profile/user-avatar"

export interface PlaylistPerson {
  id: string
  name: string
  avatarUrl: string | null
  /** Shown under the name, e.g. "Criador" / "Colaborador". */
  role: string
  /** Profile route. */
  to: string
  /** Show a remove button (owner removing a collaborator). */
  removable?: boolean
}

interface PlaylistPeopleSheetProps {
  open: boolean
  people: PlaylistPerson[]
  /** Called when the owner removes a collaborator. */
  onRemove?: (person: PlaylistPerson) => void | Promise<void>
  error?: string | null
  /** Owner only: opens the invite search. */
  onInvite?: () => void
  onClose: () => void
}

/** Everyone who belongs to a playlist: the owner and its collaborators. */
export function PlaylistPeopleSheet({
  open,
  people,
  onRemove,
  error,
  onInvite,
  onClose,
}: PlaylistPeopleSheetProps) {
  React.useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pessoas da playlist"
      className="bg-background/80 fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground border-border animate-in slide-in-from-bottom md:fade-in w-full max-w-md rounded-t-2xl border p-5 shadow-xl duration-200 ease-out md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Pessoas</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        {error ? (
          <p className="text-destructive mb-2 text-xs">{error}</p>
        ) : null}
        {onInvite ? (
          <button
            type="button"
            onClick={onInvite}
            className="hover:bg-accent/40 mb-1 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors"
          >
            <span className="bg-secondary text-secondary-foreground flex size-10 items-center justify-center rounded-full">
              <UserPlus className="size-5" />
            </span>
            <span className="text-foreground text-sm font-medium">
              Convidar colaborador
            </span>
          </button>
        ) : null}
        <ul role="list" className="max-h-80 overflow-y-auto">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-1">
              <Link
                to={person.to}
                onClick={onClose}
                className="hover:bg-accent/40 flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 transition-colors"
              >
                <UserAvatar
                  name={person.name}
                  avatarUrl={person.avatarUrl}
                  className="size-10"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-foreground truncate text-sm font-medium">
                    {person.name}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {person.role}
                  </span>
                </span>
              </Link>
              {person.removable && onRemove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover ${person.name}`}
                  onClick={() => void onRemove(person)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <UserMinus className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  )
}
