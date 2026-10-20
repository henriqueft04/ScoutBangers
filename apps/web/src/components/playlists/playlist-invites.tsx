import * as React from "react"
import { Check, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import {
  myInvites,
  respondToInvite,
  type PlaylistInvite,
} from "@/lib/playlist-collaborators"

interface PlaylistInvitesProps {
  /** Called after an invite is accepted, so the playlist list can refresh. */
  onAccepted: () => void
}

/**
 * Pending "be a collaborator" invitations. Renders nothing when there are
 * none (or the lookup fails), so the page stays clean for most people.
 */
export function PlaylistInvites({ onAccepted }: PlaylistInvitesProps) {
  const [invites, setInvites] = React.useState<PlaylistInvite[]>([])
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void myInvites().then((rows) => {
      if (!cancelled && rows) setInvites(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (invites.length === 0) return null

  const respond = async (invite: PlaylistInvite, accept: boolean) => {
    setBusyId(invite.playlistId)
    setError(null)
    const failure = await respondToInvite(invite.playlistId, accept)
    setBusyId(null)
    if (failure) {
      setError(failure)
      return
    }
    setInvites((prev) => prev.filter((i) => i.playlistId !== invite.playlistId))
    if (accept) onAccepted()
  }

  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-muted-foreground px-3 text-xs font-semibold tracking-wide uppercase">
        Convites
      </h3>
      {error ? <p className="text-destructive px-3 text-xs">{error}</p> : null}
      <ul role="list" className="flex flex-col gap-1">
        {invites.map((invite) => (
          <li
            key={invite.playlistId}
            className="bg-card border-border flex items-center gap-2 rounded-md border px-3 py-2.5"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-foreground truncate text-sm font-medium">
                {invite.playlistName}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {invite.inviterName} convidou-te para colaborar
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={busyId === invite.playlistId}
              onClick={() => void respond(invite, true)}
            >
              <Check className="size-4" />
              Aceitar
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Recusar convite"
              disabled={busyId === invite.playlistId}
              onClick={() => void respond(invite, false)}
            >
              <X className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
