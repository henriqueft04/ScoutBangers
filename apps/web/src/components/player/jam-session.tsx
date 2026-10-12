import * as React from "react"

import { useAuth } from "@/hooks/useAuth"
import { usePlayer } from "@/hooks/usePlayer"
import { usePlayerProgress } from "@/hooks/usePlayerProgress"
import { orderWindow, queueEntries, queueInputs, sameIds } from "@/lib/jam"
import {
  JAM_STATE_KEYS,
  MAX_NAME_CHARS,
  type JamPatch,
  type JamState,
  type ServerMessage,
} from "@/lib/jam-protocol"
import { connectJam, type JamConnection } from "@/lib/jam-socket"

import type { JamInfo } from "./jam-context"

type StateKey = keyof JamState

/** Position drift, in seconds, below which a listener isn't nudged. */
const SEEK_TOLERANCE_SEC = 2
/** A jump between two progress ticks this big is a seek, not playback. */
const SEEK_JUMP_SEC = 3
/** Coalesces bursts (skipping through songs) into one broadcast. */
const SEND_DEBOUNCE_MS = 150
/** How often a listener checks it hasn't drifted from the room. */
const RESYNC_INTERVAL_MS = 30_000
const GUEST_NAME = "Convidado"

const TICK_KEYS: ReadonlySet<StateKey> = new Set<StateKey>(["position", "playing"])

interface JamSessionProps {
  roomId: string
  onInfo: (info: JamInfo) => void
}

/**
 * The live end of a jam: connects to the room, applies what other
 * listeners do to the local player, and broadcasts what this listener does.
 * Renders nothing — mounting it joins the room, unmounting leaves.
 *
 * Only *changes* travel, as patches of the fields that changed. They are
 * detected on the *edge* (the song, play state, … changed), never by
 * comparing against the room: when a listener's autoplay is blocked, or a
 * song is still buffering, its player legitimately lags the room, and that
 * must not read as "I paused".
 */
export function JamSession({ roomId, onInfo }: JamSessionProps) {
  const {
    songs,
    loading,
    currentIndex,
    isPlaying,
    shuffle,
    repeat,
    userQueue,
    playbackList,
    playbackCursorId,
    play,
    toggle,
    seek,
    queueSet,
    setRepeat,
    adoptPlayback,
  } = usePlayer()
  const { position } = usePlayerProgress()
  const { user, profile } = useAuth()

  // The player restores last session's song once the library has loaded; a
  // jam must not apply anything before that, or the restore overwrites it.
  const libraryReady = !loading && songs.length > 0
  const songId = currentIndex !== null ? (songs[currentIndex]?.id ?? null) : null
  const cursor = playbackCursorId ?? songId
  const name = (
    profile?.display_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    GUEST_NAME
  ).slice(0, MAX_NAME_CHARS)
  const queue = React.useMemo(() => queueEntries(userQueue, name), [userQueue, name])
  const queueIds = React.useMemo(() => queue.map((entry) => entry.id), [queue])
  const known = React.useMemo(() => new Set(songs.map((song) => song.id)), [songs])

  const avatar =
    profile?.avatar_url ?? (user?.user_metadata?.avatar_url as string | undefined) ?? null

  const connection = React.useRef<JamConnection | null>(null)
  /** The room's state as far as we know, including our own unsent changes. */
  const shared = React.useRef<JamState | null>(null)
  /** The last revision we saw; the next `sync` must be this + 1. */
  const rev = React.useRef(0)
  /** Our changes waiting out the debounce, and whether they carry the playhead. */
  const outgoing = React.useRef<JamPatch>({})
  const needsPosition = React.useRef(false)
  const sendTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  /** A full resync is in flight; don't ask again until it lands. */
  const resyncing = React.useRef(false)
  /** The room's state arrived before the library finished loading. */
  const pendingApply = React.useRef(false)
  const info = React.useRef<JamInfo>({ status: "connecting", members: [], you: null })
  /** The room's state has been applied (or the room was empty). */
  const [ready, setReady] = React.useState(false)

  // Fresh player values for socket callbacks, which outlive any one render.
  const latest = React.useRef({
    libraryReady,
    songs,
    known,
    currentIndex,
    isPlaying,
    shuffle,
    repeat,
    position,
    queue: queueIds,
    playbackList,
    playbackCursorId,
    play,
    toggle,
    seek,
    queueSet,
    setRepeat,
    adoptPlayback,
  })
  React.useEffect(() => {
    latest.current = {
      libraryReady,
      songs,
      known,
      currentIndex,
      isPlaying,
      shuffle,
      repeat,
      position,
      queue: queueIds,
      playbackList,
      playbackCursorId,
      play,
      toggle,
      seek,
      queueSet,
      setRepeat,
      adoptPlayback,
    }
  })

  const report = React.useCallback(
    (patch: Partial<JamInfo>) => {
      info.current = { ...info.current, ...patch }
      onInfo(info.current)
    },
    [onInfo]
  )

  const latencySec = React.useCallback(() => connection.current?.latencySec() ?? 0, [])

  const hasPending = () =>
    needsPosition.current || Object.keys(outgoing.current).length > 0

  /** "Send me everything": our picture of the room can't be trusted. */
  const requestFullState = React.useCallback(() => {
    if (resyncing.current) return
    resyncing.current = true
    // No revision is ever -1, so the relay answers with the full state.
    connection.current?.send({ type: "resync", rev: -1 })
  }, [])

  const flush = React.useCallback(() => {
    const patch: JamPatch = { ...outgoing.current }
    if (needsPosition.current) {
      // Stamped now, not when the change happened, and projected forward by
      // the time the message takes to reach the relay.
      const playing = shared.current?.playing ?? latest.current.isPlaying
      patch.position = latest.current.position + (playing ? latencySec() : 0)
    }
    outgoing.current = {}
    needsPosition.current = false
    if (Object.keys(patch).length > 0) {
      connection.current?.send({ type: "patch", patch })
    }
  }, [latencySec])

  const push = React.useCallback(
    (patch: JamPatch, withPosition = false) => {
      if (shared.current) shared.current = { ...shared.current, ...patch }
      outgoing.current = { ...outgoing.current, ...patch }
      if (withPosition) needsPosition.current = true
      clearTimeout(sendTimer.current)
      sendTimer.current = setTimeout(flush, SEND_DEBOUNCE_MS)
    },
    [flush]
  )

  // Previous tick's song + position, to tell a seek from ordinary playback.
  const lastTick = React.useRef<{ songId: string; position: number } | null>(null)

  /** Brings the local player in line with `remote`, for the fields in `changed`. */
  const applyRemote = React.useCallback(
    (remote: JamState, changed: ReadonlySet<StateKey>) => {
      const l = latest.current
      if (!l.libraryReady) {
        pendingApply.current = true
        return
      }
      const index = l.songs.findIndex((song) => song.id === remote.songId)
      if (index === -1) return // not in this listener's library

      const current = l.currentIndex !== null ? l.songs[l.currentIndex] : undefined
      const songChanged = current?.id !== remote.songId

      // Order matters: play() resets the playback list and drains the queue,
      // so the room's list, cursor and queue are applied after it, in the
      // same batch.
      if (songChanged) l.play(index)

      if (
        songChanged ||
        ((changed.has("order") || changed.has("cursor") || changed.has("shuffle")) &&
          (l.shuffle !== remote.shuffle ||
            l.playbackCursorId !== remote.cursor ||
            !sameIds(l.playbackList, remote.order, l.known)))
      ) {
        l.adoptPlayback({
          list: remote.order.filter((id) => l.known.has(id)),
          cursorId: remote.cursor,
          shuffle: remote.shuffle,
        })
      }

      if (
        (songChanged || changed.has("queue")) &&
        !sameIds(l.queue, remote.queue.map((entry) => entry.id), l.known)
      ) {
        l.queueSet(queueInputs(remote.queue, l.known))
      }

      if (changed.has("repeat") && remote.repeat !== l.repeat) l.setRepeat(remote.repeat)

      // play() starts playback, so a changed song is playing by now.
      if (
        (songChanged || changed.has("playing")) &&
        remote.playing !== (songChanged || l.isPlaying)
      ) {
        l.toggle()
      }

      let landedAt = l.position
      if (songChanged || changed.has("position")) {
        landedAt = remote.position + (remote.playing ? latencySec() : 0)
        const drifted = Math.abs(l.position - landedAt) > SEEK_TOLERANCE_SEC
        if (songChanged ? landedAt > 1 : drifted) l.seek(landedAt)
      }

      // What we just did to the player is not the listener's own doing.
      lastTick.current = { songId: remote.songId, position: landedAt }
    },
    [latencySec]
  )

  // The library finished loading after the room's state arrived. What we
  // kept is seconds stale by now (the playhead has moved on), and the
  // player's session restore is running in this very commit — so don't apply
  // it, ask for the live state. The reply is asynchronous, so it always lands
  // after the restore.
  React.useEffect(() => {
    if (!libraryReady || !pendingApply.current) return
    pendingApply.current = false
    requestFullState()
  }, [libraryReady, requestFullState])

  React.useEffect(() => {
    /** Keys the listener has changed but not yet sent: those win over the room. */
    const unsentKeys = () =>
      new Set<StateKey>([
        ...(Object.keys(outgoing.current) as StateKey[]),
        ...(needsPosition.current ? (["position"] as const) : []),
      ])

    const handleMessage = (message: ServerMessage) => {
      switch (message.type) {
        case "hello": {
          rev.current = message.rev
          resyncing.current = false
          report({ members: message.members, you: message.you })
          // A change we haven't sent yet outranks what the room says about it.
          const unsent = unsentKeys()
          shared.current = message.state && { ...message.state, ...outgoing.current }
          if (shared.current) {
            applyRemote(
              shared.current,
              new Set(JAM_STATE_KEYS.filter((key) => !unsent.has(key)))
            )
          }
          setReady(true)
          break
        }
        case "sync": {
          // A gap means we missed a message: our picture of the room is stale.
          if (message.rev !== rev.current + 1 || !shared.current) {
            requestFullState()
            break
          }
          rev.current = message.rev
          // Where the room and an unsent change disagree, the room wins.
          for (const key of Object.keys(message.patch)) {
            delete outgoing.current[key as StateKey]
          }
          if ("position" in message.patch || "songId" in message.patch) {
            needsPosition.current = false
          }
          shared.current = { ...shared.current, ...message.patch }
          applyRemote(shared.current, new Set(Object.keys(message.patch) as StateKey[]))
          break
        }
        case "tick": {
          if (
            message.rev !== rev.current ||
            !shared.current ||
            shared.current.songId !== message.songId
          ) {
            requestFullState()
            break
          }
          // The listener just did something that is about to be sent.
          if (hasPending()) break
          shared.current = {
            ...shared.current,
            position: message.position,
            playing: message.playing,
          }
          applyRemote(shared.current, TICK_KEYS)
          break
        }
        case "ack":
          rev.current = message.rev
          break
        case "members":
          report({ members: message.members })
          break
      }
    }

    const conn = connectJam(roomId, {
      onMessage: handleMessage,
      onStatus: (status) => {
        report({ status })
        if (status !== "live") {
          resyncing.current = false
          setReady(false)
        }
      },
    })
    connection.current = conn
    return () => {
      conn.close()
      connection.current = null
      clearTimeout(sendTimer.current)
    }
  }, [roomId, report, applyRemote, requestFullState])

  // Tell the room who this listener is (and again if the profile loads late).
  React.useEffect(() => {
    if (ready) connection.current?.send({ type: "profile", name, avatar })
  }, [ready, name, avatar])

  // Catch drift: on returning to the app, and every so often while in it.
  React.useEffect(() => {
    if (!ready) return
    const resync = () => connection.current?.send({ type: "resync", rev: rev.current })
    const interval = setInterval(resync, RESYNC_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") resync()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [ready])

  // Broadcast what the listener changed, as a patch of just those fields.
  const before = React.useRef<{
    songId: string
    playing: boolean
    shuffle: boolean
    repeat: typeof repeat
    cursor: string
    queue: JamState["queue"]
    playbackList: string[]
  } | null>(null)
  React.useEffect(() => {
    if (!songId || !cursor) return
    const previous = before.current
    before.current = { songId, playing: isPlaying, shuffle, repeat, cursor, queue, playbackList }
    if (!ready) return

    const room = shared.current
    if (!room) {
      // First one in seeds the empty room with everything.
      const full: JamState = {
        songId,
        position: latest.current.position,
        playing: isPlaying,
        shuffle,
        repeat,
        order: orderWindow(playbackList, cursor),
        cursor,
        queue,
      }
      shared.current = full
      push(full, true)
      return
    }
    if (!previous) return

    const patch: JamPatch = {}
    let withPosition = false
    if (previous.songId !== songId && room.songId !== songId) {
      patch.songId = songId
      withPosition = true
    }
    if (previous.playing !== isPlaying && room.playing !== isPlaying) {
      patch.playing = isPlaying
      withPosition = true
    }
    if (previous.shuffle !== shuffle && room.shuffle !== shuffle) patch.shuffle = shuffle
    if (previous.repeat !== repeat && room.repeat !== repeat) patch.repeat = repeat
    if (previous.cursor !== cursor && room.cursor !== cursor) patch.cursor = cursor
    if (
      previous.queue !== queue &&
      !sameIds(queueIds, room.queue.map((entry) => entry.id), known)
    ) {
      patch.queue = queue
    }
    if (previous.playbackList !== playbackList) {
      const order = orderWindow(playbackList, cursor)
      if (!sameIds(order, room.order, known)) patch.order = order
    }
    if (withPosition || Object.keys(patch).length > 0) push(patch, withPosition)
  }, [ready, songId, cursor, isPlaying, shuffle, repeat, queue, queueIds, playbackList, known, push])

  // Broadcast seeks: a jump between ticks that playback can't explain.
  React.useEffect(() => {
    const previous = lastTick.current
    lastTick.current = songId ? { songId, position } : null
    if (!ready || !songId || previous?.songId !== songId) return
    if (Math.abs(position - previous.position) < SEEK_JUMP_SEC) return
    push({}, true)
    // Only the position moving should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position])

  return null
}
