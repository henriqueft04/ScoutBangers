import * as React from "react"

import { ConfirmDialog } from "@/components/profile/confirm-dialog"
import { UserAvatar } from "@/components/profile/user-avatar"
import { useJam } from "@/hooks/useJam"

const LABEL_CLASS = "text-xs uppercase tracking-wider"
const MAX_AVATARS = 3

/**
 * The full-screen player's header title: "A Reproduzir" normally, and a
 * tappable jam indicator — who is listening, and a way out — while in one.
 */
export function JamStatus() {
  const { roomId, status, members, you, leave } = useJam()
  const [open, setOpen] = React.useState(false)

  if (!roomId) {
    return (
      <p data-tour-id="jam-status" className={`text-muted-foreground ${LABEL_CLASS}`}>
        A Reproduzir
      </p>
    )
  }

  const live = status === "live"
  const label =
    status === "closed"
      ? "Jam · sem ligação"
      : !live
        ? "Jam · a ligar…"
        : members.length > 1
          ? `Jam · ${members.length} a ouvir`
          : "Jam · à espera de amigos"

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour-id="jam-status"
        className={`text-primary touch-manipulation inline-flex items-center gap-2 ${LABEL_CLASS}`}
      >
        {live ? (
          <span className="flex -space-x-1.5">
            {members.slice(0, MAX_AVATARS).map((member) => (
              <UserAvatar
                key={member.id}
                name={member.name}
                avatarUrl={member.avatar}
                className="ring-background ring-2"
              />
            ))}
          </span>
        ) : null}
        {label}
      </button>
      <ConfirmDialog
        open={open}
        title="Jam"
        description={
          members.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {members.map((member) => (
                <li key={member.id} className="flex items-center gap-2">
                  <UserAvatar
                    name={member.name}
                    avatarUrl={member.avatar}
                    className="size-7 text-xs"
                  />
                  <span className="text-foreground truncate">
                    {member.name}
                    {member.id === you ? (
                      <span className="text-muted-foreground"> (tu)</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            "A ligar…"
          )
        }
        confirmLabel="Sair da jam"
        cancelLabel="Fechar"
        destructive
        onConfirm={() => {
          leave()
          setOpen(false)
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
