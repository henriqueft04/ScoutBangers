import * as React from "react"

import { ConfirmDialog } from "@/components/profile/confirm-dialog"
import {
  createRoomId,
  readInviteRoomId,
  stripInviteParam,
} from "@/lib/jam"
import { getCached, removeCached, setCached } from "@/lib/storage"

import { JamContext, type JamContextValue, type JamInfo } from "./jam-context"
import { JamSession } from "./jam-session"

const ROOM_KEY = "scoutbangers:jam-room"
/** Rooms are forgotten by the relay after an hour empty; so are we. */
const ROOM_TTL_MS = 60 * 60 * 1000

/**
 * Owns "which jam am I in". The room survives a refresh for a while, and an
 * invite link (`/?jam=<roomId>`) asks before joining — the tap is also the
 * user gesture the browser needs to let audio start.
 *
 * The socket and sync logic live in `JamSession`, which is mounted only
 * while a room is joined: joining is mounting, leaving is unmounting.
 */
export function JamProvider({ children }: { children: React.ReactNode }) {
  const [roomId, setRoomId] = React.useState<string | null>(() =>
    getCached<string>(ROOM_KEY)
  )
  const [invite, setInvite] = React.useState<string | null>(() =>
    readInviteRoomId(window.location.search)
  )
  const [info, setInfo] = React.useState<JamInfo>({
    status: "connecting",
    members: [],
    you: null,
  })

  // Take the invite out of the address bar so a refresh doesn't re-prompt.
  React.useEffect(() => {
    if (!invite) return
    const url = new URL(window.location.href)
    stripInviteParam(url)
    window.history.replaceState(null, "", url.pathname + url.search)
  }, [invite])

  const join = React.useCallback((id: string) => {
    setCached(ROOM_KEY, id, ROOM_TTL_MS)
    setRoomId(id)
  }, [])

  const start = React.useCallback(() => {
    const id = createRoomId()
    join(id)
    return id
  }, [join])

  const leave = React.useCallback(() => {
    removeCached(ROOM_KEY)
    setRoomId(null)
  }, [])

  const value = React.useMemo<JamContextValue>(
    () => ({
      ...info,
      status: roomId ? info.status : "idle",
      roomId,
      start,
      leave,
    }),
    [info, roomId, start, leave]
  )

  return (
    <JamContext.Provider value={value}>
      {children}
      {roomId ? (
        <JamSession key={roomId} roomId={roomId} onInfo={setInfo} />
      ) : null}
      <ConfirmDialog
        open={invite !== null}
        title="Entrar na jam?"
        description="Vais ouvir o mesmo que os teus amigos, ao mesmo tempo."
        confirmLabel="Entrar"
        cancelLabel="Agora não"
        onConfirm={() => {
          if (invite) join(invite)
          setInvite(null)
        }}
        onCancel={() => setInvite(null)}
      />
    </JamContext.Provider>
  )
}
