import { Link } from "react-router-dom"
import { UserMinus, UserPlus } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { BottomSheet } from "@/components/common/bottom-sheet"
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
  if (!open) return null

  return (
    <BottomSheet open={open} title="Pessoas" onClose={onClose}>
      {error ? <p className="text-destructive mb-2 text-xs">{error}</p> : null}
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
    </BottomSheet>
  )
}
