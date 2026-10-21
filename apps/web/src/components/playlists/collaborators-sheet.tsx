import * as React from "react"
import { Loader2, Search, UserMinus } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { UserAvatar } from "@/components/profile/user-avatar"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import {
  inviteCollaborator,
  removeCollaborator,
  searchPeople,
  type Collaborator,
  type PersonResult,
} from "@/lib/playlist-collaborators"

interface CollaboratorsSheetProps {
  open: boolean
  playlistId: string
  /** Owners invite and remove; collaborators can only leave. */
  isOwner: boolean
  userId: string | undefined
  collaborators: Collaborator[]
  /** Shown first in the list; they can't be removed. */
  owner?: { id: string; name: string; avatarUrl: string | null }
  onChange: (next: Collaborator[]) => void
  /** The current user left the playlist. */
  onLeft: () => void
  onClose: () => void
}

/**
 * Collaborator management for a playlist: the owner searches people and
 * invites them (they accept from their Playlists page) and can remove
 * anyone; a collaborator sees the list and can leave.
 */
export function CollaboratorsSheet({
  open,
  playlistId,
  isOwner,
  userId,
  collaborators,
  owner,
  onChange,
  onLeft,
  onClose,
}: CollaboratorsSheetProps) {
  const [query, setQuery] = React.useState("")
  const debounced = useDebouncedValue(query.trim(), 250)
  const [results, setResults] = React.useState<PersonResult[]>([])
  const [searching, setSearching] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || !isOwner || debounced.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    void searchPeople(debounced).then((rows) => {
      if (cancelled) return
      setSearching(false)
      setResults(rows ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [open, isOwner, debounced])

  if (!open) return null

  const taken = new Set(collaborators.map((c) => c.userId))
  const invitable = results.filter((p) => p.id !== userId && !taken.has(p.id))

  const handleInvite = async (person: PersonResult) => {
    setBusyId(person.id)
    setError(null)
    const failure = await inviteCollaborator(playlistId, person.id)
    setBusyId(null)
    if (failure) {
      setError(failure)
      return
    }
    onChange([
      ...collaborators,
      {
        userId: person.id,
        displayName: person.displayName,
        avatarUrl: person.avatarUrl,
        status: "pending",
      },
    ])
  }

  const handleRemove = async (collaborator: Collaborator) => {
    setBusyId(collaborator.userId)
    setError(null)
    const failure = await removeCollaborator(playlistId, collaborator.userId)
    setBusyId(null)
    if (failure) {
      setError(failure)
      return
    }
    onChange(collaborators.filter((c) => c.userId !== collaborator.userId))
    if (collaborator.userId === userId) onLeft()
  }

  return (
    <BottomSheet open={open} title="Colaboradores" onClose={onClose}>
      {error ? <p className="text-destructive mb-2 text-xs">{error}</p> : null}

      {isOwner ? (
        <div className="mb-3">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Procurar pessoas para convidar"
              className="border-input bg-background focus-visible:ring-ring/40 w-full rounded-md border py-2 pr-3 pl-9 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
          </div>
          {debounced ? (
            <ul role="list" className="mt-1 flex flex-col">
              {searching ? (
                <li className="py-3">
                  <Loader2 className="text-muted-foreground mx-auto size-4 animate-spin" />
                </li>
              ) : invitable.length === 0 ? (
                <li className="text-muted-foreground py-3 text-center text-xs">
                  Ninguém encontrado.
                </li>
              ) : (
                invitable.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center gap-3 rounded-md px-2 py-2"
                  >
                    <UserAvatar
                      name={person.displayName}
                      avatarUrl={person.avatarUrl}
                      className="size-8"
                    />
                    <span className="text-foreground min-w-0 flex-1 truncate text-sm">
                      {person.displayName}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === person.id}
                      onClick={() => void handleInvite(person)}
                    >
                      {busyId === person.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Convidar"
                      )}
                    </Button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="max-h-72 overflow-y-auto">
        {collaborators.length === 0 && !owner ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Ainda não há colaboradores.
          </p>
        ) : (
          <ul role="list" className="flex flex-col">
            {owner ? (
              <li className="flex items-center gap-3 rounded-md px-2 py-2">
                <UserAvatar
                  name={owner.name}
                  avatarUrl={owner.avatarUrl}
                  className="size-8"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-foreground truncate text-sm">
                    {owner.name}
                    {owner.id === userId ? " (tu)" : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">Criador</span>
                </div>
              </li>
            ) : null}
            {collaborators.map((collaborator) => {
              const isMe = collaborator.userId === userId
              const canRemove = isOwner || isMe
              return (
                <li
                  key={collaborator.userId}
                  className="flex items-center gap-3 rounded-md px-2 py-2"
                >
                  <UserAvatar
                    name={collaborator.displayName}
                    avatarUrl={collaborator.avatarUrl}
                    className="size-8"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-foreground truncate text-sm">
                      {collaborator.displayName}
                      {isMe ? " (tu)" : ""}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {collaborator.status === "pending"
                        ? "Convite pendente"
                        : "Colaborador"}
                    </span>
                  </div>
                  {canRemove ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busyId === collaborator.userId}
                      onClick={() => void handleRemove(collaborator)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <UserMinus className="size-4" />
                      {isMe
                        ? "Sair"
                        : collaborator.status === "pending"
                          ? "Cancelar"
                          : "Remover"}
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  )
}
