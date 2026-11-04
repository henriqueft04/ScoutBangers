import * as React from "react"

import { usePlayer } from "@/hooks/usePlayer"
import { usePlayerProgress } from "@/hooks/usePlayerProgress"
import type {
  ConnectCommand,
  ConnectPatch,
  ConnectServerMessage,
  ConnectState,
} from "@/lib/connect-protocol"
import { connectSession, type ConnectConnection } from "@/lib/connect-socket"
import { deviceName, getOrCreateDeviceId } from "@/lib/device"
import { orderWindow, queueInputs, sameIds } from "@/lib/jam"
import type { JamQueueEntry } from "@/lib/jam-protocol"
import { supabase } from "@/lib/supabase"

import { IDLE_INFO, type ConnectControls, type ConnectInfo } from "./connect-context"

/** Position drift, in seconds, below which a device isn't nudged. */
const SEEK_TOLERANCE_SEC = 2
/** A jump between two progress ticks this big is a seek, not playback. */
const SEEK_JUMP_SEC = 3
/** Coalesces bursts (skipping through songs) into one message. */
const SEND_DEBOUNCE_MS = 150
/** The relay drops messages closer together than this; leave it some room. */
const RELAY_GAP_MS = 80
/** Seek and volume drags send at most this often, the last value winning. */
const DRAG_THROTTLE_MS = 120
/** The active device re-states the playhead this often, so a stall can't drift. */
const HEARTBEAT_MS = 30_000
/** Waits out the player's own session restore, which runs as the library loads. */
const AFTER_RESTORE_MS = 60

interface ConnectEngineProps {
  /** A jam is driving this device's player: it plays here, whatever the session says. */
  inJam: boolean
  onInfo: (info: ConnectInfo) => void
  controlsRef: React.RefObject<ConnectControls | null>
}

const entriesOf = (queue: readonly { songId: string; addedBy?: string }[]): JamQueueEntry[] =>
  queue.map((item) => ({ id: item.songId, by: item.addedBy ?? null }))

async function getToken(): Promise<string | null> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: null }
  return data?.session?.access_token ?? null
}

/**
 * The live end of Connect: keeps this device's socket to the account's
 * session open, and does what the device's role calls for. Renders nothing —
 * mounting it joins the session, unmounting leaves.
 *
 * Roles (exactly one device is active):
 *   - active: makes the sound. Its player is the source of truth; every
 *     change is sent as a patch, and commands from other devices are run
 *     through the ordinary player actions.
 *   - remote: silent. It mirrors the session's state, which `ConnectProvider`
 *     serves through the player context, and sends commands.
 *   - parked: nobody is playing. A device that starts playing claims the
 *     session; one that doesn't picks up where the account left off, paused.
 *
 * As in a jam, changes are detected on the *edge* (the song, play state, …
 * changed), never by comparing against the session: a song that is still
 * buffering, or autoplay that is blocked, must not read as "I paused".
 */
export function ConnectEngine({ inJam, onInfo, controlsRef }: ConnectEngineProps) {
  const {
    songs,
    loading,
    currentIndex,
    isPlaying,
    shuffle,
    repeat,
    volume,
    userQueue,
    playbackList,
    playbackCursorId,
    play,
    skipTo,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    toggleShuffle,
    setRepeat,
    queueSet,
    adoptPlayback,
  } = usePlayer()
  const { position } = usePlayerProgress()

  const me = React.useMemo(() => getOrCreateDeviceId(), [])
  const libraryReady = !loading && songs.length > 0
  const songId = currentIndex !== null ? (songs[currentIndex]?.id ?? null) : null
  const cursor = playbackCursorId ?? songId
  const queue = React.useMemo(() => entriesOf(userQueue), [userQueue])
  const queueIds = React.useMemo(() => userQueue.map((item) => item.songId), [userQueue])
  const known = React.useMemo(() => new Set(songs.map((song) => song.id)), [songs])

  const connection = React.useRef<ConnectConnection | null>(null)
  const info = React.useRef<ConnectInfo>({
    ...IDLE_INFO,
    status: "connecting",
  })
  /** The last revision we saw; the next `sync` must be this + 1. */
  const rev = React.useRef(0)
  /** A full resync is in flight; don't ask again until it lands. */
  const resyncing = React.useRef(false)
  /** Our changes waiting out the debounce, and whether they carry the playhead. */
  const outgoing = React.useRef<ConnectPatch>({})
  const needsPosition = React.useRef(false)
  const sendTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  /** The session's state arrived before the library finished loading. */
  const pendingApply = React.useRef<"activate" | "adopt" | null>(null)
  /** Whether this device was the active one as of the last message. */
  const wasActive = React.useRef(false)
  /** The parked session was loaded into the player on this connection. */
  const adopted = React.useRef(false)
  /** We seeded the session from our own player, so there is nothing to load. */
  const claimed = React.useRef(false)
  const throttles = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())
  /** The newest seek / volume value, waiting for its throttle to fire. */
  const dragged = React.useRef(new Map<string, ConnectCommand>())
  const inJamRef = React.useRef(inJam)
  React.useEffect(() => {
    inJamRef.current = inJam
  })
  /** A hello has landed on this connection. */
  const [ready, setReady] = React.useState(false)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const isActive = ready && activeId === me

  // Fresh player values for socket callbacks, which outlive any one render.
  const latest = React.useRef({
    libraryReady,
    songs,
    known,
    currentIndex,
    isPlaying,
    shuffle,
    repeat,
    volume,
    position,
    queue,
    queueIds,
    playbackList,
    playbackCursorId,
    play,
    skipTo,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    toggleShuffle,
    setRepeat,
    queueSet,
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
      volume,
      position,
      queue,
      queueIds,
      playbackList,
      playbackCursorId,
      play,
      skipTo,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      toggleShuffle,
      setRepeat,
      queueSet,
      adoptPlayback,
    }
  })

  const publish = React.useCallback(
    (patch: Partial<ConnectInfo>) => {
      info.current = { ...info.current, ...patch }
      onInfo(info.current)
    },
    [onInfo]
  )

  const latencySec = React.useCallback(() => connection.current?.latencySec() ?? 0, [])

  /** Where the session's playhead is right now. */
  const livePosition = React.useCallback(() => {
    const { remote, at } = info.current
    if (!remote) return 0
    return remote.position + (remote.playing ? Math.max(0, Date.now() - at) / 1000 : 0)
  }, [])

  /** "Send me everything": our picture of the session can't be trusted. */
  const requestFullState = React.useCallback(() => {
    if (resyncing.current) return
    resyncing.current = true
    connection.current?.send({ type: "resync" })
  }, [])

  /** This player's complete state, to seed a session that has none. */
  const localState = React.useCallback((): ConnectState | null => {
    const l = latest.current
    const song = l.currentIndex !== null ? l.songs[l.currentIndex] : undefined
    if (!song) return null
    const anchor = l.playbackCursorId ?? song.id
    return {
      songId: song.id,
      position: l.position,
      playing: l.isPlaying,
      shuffle: l.shuffle,
      repeat: l.repeat,
      order: orderWindow(l.playbackList, anchor),
      cursor: anchor,
      queue: l.queue,
      volume: l.volume,
    }
  }, [])

  // ---- Active device: telling the others what happened ------------------

  const flush = React.useCallback(() => {
    clearTimeout(sendTimer.current)
    const patch: ConnectPatch = { ...outgoing.current }
    if (needsPosition.current) {
      // Stamped now, not when the change happened, and projected forward by
      // the time the message takes to reach the relay.
      const playing = info.current.remote?.playing ?? latest.current.isPlaying
      patch.position = latest.current.position + (playing ? latencySec() : 0)
    }
    outgoing.current = {}
    needsPosition.current = false
    if (Object.keys(patch).length > 0) {
      connection.current?.send({ type: "patch", patch })
      // The relay doesn't echo our own patches back, but it numbers them: keep
      // count, or the next message after a handover would look like a gap and
      // cost a full resync. (If one was dropped, that resync is the repair.)
      rev.current += 1
    }
  }, [latencySec])

  const push = React.useCallback(
    (patch: ConnectPatch, withPosition = false) => {
      const { remote } = info.current
      if (remote) {
        // Keep our own picture of the session in step with what we send.
        publish({
          remote: {
            ...remote,
            position: livePosition(),
            ...patch,
            ...(withPosition ? { position: latest.current.position } : {}),
          },
          at: Date.now(),
        })
      }
      outgoing.current = { ...outgoing.current, ...patch }
      if (withPosition) needsPosition.current = true
      clearTimeout(sendTimer.current)
      sendTimer.current = setTimeout(flush, SEND_DEBOUNCE_MS)
    },
    [flush, livePosition, publish]
  )

  // ---- Becoming active: loading the session into the player -------------

  /** Brings the local player in line with `remote`. `play` lets it start. */
  const applySnapshot = React.useCallback(
    (remote: ConnectState, play: boolean) => {
      const l = latest.current
      if (!l.libraryReady) {
        pendingApply.current = play ? "activate" : "adopt"
        return
      }
      const index = l.songs.findIndex((song) => song.id === remote.songId)
      if (index === -1) return // not in this device's library

      const current = l.currentIndex !== null ? l.songs[l.currentIndex] : undefined
      const songChanged = current?.id !== remote.songId

      // Order matters: play() resets the playback list and drains the queue,
      // so the session's list, cursor and queue are applied after it, in the
      // same batch.
      if (songChanged) l.play(index)
      if (
        songChanged ||
        l.shuffle !== remote.shuffle ||
        l.playbackCursorId !== remote.cursor ||
        !sameIds(l.playbackList, remote.order, l.known)
      ) {
        l.adoptPlayback({
          list: remote.order.filter((id) => l.known.has(id)),
          cursorId: remote.cursor,
          shuffle: remote.shuffle,
        })
      }
      if (
        songChanged ||
        !sameIds(
          l.queueIds,
          remote.queue.map((entry) => entry.id),
          l.known
        )
      ) {
        l.queueSet(queueInputs(remote.queue, l.known))
      }
      if (remote.repeat !== l.repeat) l.setRepeat(remote.repeat)

      // play() starts playback, so a changed song is playing by now.
      const wantPlaying = play && remote.playing
      if (wantPlaying !== (songChanged || l.isPlaying)) l.toggle()

      const landedAt = livePosition() + (wantPlaying ? latencySec() : 0)
      const drifted = Math.abs(l.position - landedAt) > SEEK_TOLERANCE_SEC
      if (songChanged ? landedAt > 1 : drifted) l.seek(landedAt)
    },
    [latencySec, livePosition]
  )

  // The library finished loading after the session's state arrived. The
  // player's own restore of last session's song runs in this very commit, so
  // applying now would be overwritten — apply just after it. The state kept
  // is seconds old, but it carries the time it was true, so the playhead
  // still lands right.
  React.useEffect(() => {
    if (!libraryReady || !pendingApply.current) return
    const mode = pendingApply.current
    pendingApply.current = null
    const timer = setTimeout(() => {
      const { remote } = info.current
      if (remote) applySnapshot(remote, mode === "activate")
    }, AFTER_RESTORE_MS)
    return () => clearTimeout(timer)
  }, [libraryReady, applySnapshot])

  /** What to do about the roles after `info` changed: activate or adopt. */
  const reconcile = React.useCallback(() => {
    const { activeId: active, remote } = info.current
    const activeNow = active === me
    const was = wasActive.current
    wasActive.current = activeNow

    if (activeNow && !was) {
      adopted.current = true
      if (claimed.current) {
        // Seeded from our own player: it already is the session.
        claimed.current = false
      } else if (remote) {
        applySnapshot(remote, true)
      }
      // The volume is the device's own, not the previous speaker's.
      push({ volume: latest.current.volume })
      return
    }
    if (active !== null) {
      adopted.current = true
      return
    }
    // Parked, and this device isn't making sound: pick up where the account
    // left off, paused. (Not over a jam, which owns the player.)
    if (!adopted.current && remote && !latest.current.isPlaying && !inJamRef.current) {
      adopted.current = true
      applySnapshot(remote, false)
    }
  }, [applySnapshot, me, push])

  // ---- The active device running other devices' commands ---------------

  const runCommand = React.useCallback((command: ConnectCommand) => {
    const l = latest.current
    switch (command.kind) {
      case "play":
        if (!l.isPlaying) l.toggle()
        return
      case "pause":
        if (l.isPlaying) l.toggle()
        return
      case "next":
        l.next()
        return
      case "prev":
        l.prev()
        return
      case "seek":
        l.seek(command.position)
        return
      case "volume":
        l.setVolume(command.volume)
        return
      case "shuffle":
        if (l.shuffle !== command.on) l.toggleShuffle()
        return
      case "repeat":
        l.setRepeat(command.mode)
        return
      case "playSong": {
        const index = l.songs.findIndex((song) => song.id === command.songId)
        if (index === -1) return
        l.play(
          index,
          command.list?.filter((id) => l.known.has(id))
        )
        return
      }
      case "skipTo":
        l.skipTo(command.songId, command.queueIndex)
        return
      case "queue":
        l.queueSet(queueInputs(command.queue, l.known))
        return
      case "order":
        l.adoptPlayback({
          list: command.order.filter((id) => l.known.has(id)),
          cursorId: l.playbackCursorId,
          shuffle: l.shuffle,
        })
        return
    }
  }, [])

  // ---- Socket -----------------------------------------------------------

  React.useEffect(() => {
    const pendingThrottles = throttles.current
    const handleMessage = (message: ConnectServerMessage) => {
      switch (message.type) {
        case "hello": {
          rev.current = message.rev
          resyncing.current = false
          const { state } = message
          publish({
            you: message.you,
            devices: message.devices,
            activeId: message.activeId,
            remote:
              state && state.playing
                ? { ...state, position: state.position + latencySec() }
                : state,
            at: Date.now(),
          })
          setActiveId(message.activeId)
          reconcile()
          setReady(true)
          break
        }
        case "sync": {
          // A gap means we missed a message: our picture of the session is stale.
          const { remote } = info.current
          if (message.rev !== rev.current + 1 || !remote) {
            requestFullState()
            break
          }
          rev.current = message.rev
          // We are the source of truth while active; this is our own echo.
          if (info.current.activeId === me) break
          const merged = {
            ...remote,
            position: livePosition(),
            ...message.patch,
          }
          if ("position" in message.patch && merged.playing) {
            merged.position += latencySec()
          }
          publish({ remote: merged, at: Date.now() })
          break
        }
        case "devices": {
          if (message.rev > rev.current + 1 || message.rev < rev.current) {
            requestFullState()
          } else {
            rev.current = message.rev
          }
          const { remote } = info.current
          const { live } = message
          publish({
            devices: message.devices,
            activeId: message.activeId,
            remote:
              remote && live
                ? {
                    ...remote,
                    ...live,
                    position: live.position + (live.playing ? latencySec() : 0),
                  }
                : remote,
            at: Date.now(),
          })
          setActiveId(message.activeId)
          reconcile()
          break
        }
        case "command":
          if (info.current.activeId === me) runCommand(message.command)
          break
        case "unreachable":
          break
      }
    }

    const conn = connectSession({
      getToken,
      onOpen: () => {
        wasActive.current = false
        adopted.current = false
        claimed.current = false
        conn.send({ type: "hello", deviceId: me, name: deviceName() })
      },
      onMessage: handleMessage,
      onStatus: (status) => {
        publish({ status })
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
      pendingThrottles.forEach(clearTimeout)
      pendingThrottles.clear()
      // Nothing of this account's may outlive its connection (a different
      // user can sign in next).
      onInfo(IDLE_INFO)
    }
  }, [me, onInfo, publish, reconcile, requestFullState, runCommand, livePosition, latencySec])

  // Catch drift: on returning to the app, ask where the session is.
  React.useEffect(() => {
    if (!ready) return
    const onVisible = () => {
      if (document.visibilityState === "visible") connection.current?.send({ type: "resync" })
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [ready])

  // ---- Roles ------------------------------------------------------------

  // Playing while nobody is: claim the session, seeding it from this player.
  // Playing while somebody else is (a takeover, or a takeover that raced a
  // reconnect): this device goes quiet — unless a jam is what is playing, in
  // which case it takes the session over instead.
  React.useEffect(() => {
    if (!ready || !isPlaying || !songId || activeId === me) return
    if (activeId !== null && !inJam) {
      latest.current.toggle()
      return
    }
    if (claimed.current) return
    const state = localState()
    if (!state) return
    claimed.current = true
    connection.current?.send({ type: "transfer", deviceId: me, state })
  }, [ready, isPlaying, songId, activeId, inJam, me, localState])

  // Broadcast what the active device changed, as a patch of just those fields.
  const before = React.useRef<{
    songId: string
    playing: boolean
    shuffle: boolean
    repeat: typeof repeat
    cursor: string
    queue: JamQueueEntry[]
    playbackList: string[]
    volume: number
  } | null>(null)
  React.useEffect(() => {
    if (!songId || !cursor) return
    const previous = before.current
    before.current = {
      songId,
      playing: isPlaying,
      shuffle,
      repeat,
      cursor,
      queue,
      playbackList,
      volume,
    }
    if (!isActive || !previous) return

    const room = info.current.remote
    if (!room) return // the claim seeds an empty session

    const patch: ConnectPatch = {}
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
      !sameIds(
        queueIds,
        room.queue.map((entry) => entry.id),
        known
      )
    ) {
      patch.queue = queue
    }
    if (previous.playbackList !== playbackList) {
      const order = orderWindow(playbackList, cursor)
      if (!sameIds(order, room.order, known)) patch.order = order
    }
    if (previous.volume !== volume && Math.abs(room.volume - volume) > 0.005) {
      patch.volume = volume
    }
    if (withPosition || Object.keys(patch).length > 0) push(patch, withPosition)
  }, [
    isActive,
    songId,
    cursor,
    isPlaying,
    shuffle,
    repeat,
    queue,
    queueIds,
    playbackList,
    volume,
    known,
    push,
  ])

  // Broadcast seeks: a jump between ticks that playback can't explain.
  const lastTick = React.useRef<{ songId: string; position: number } | null>(null)
  React.useEffect(() => {
    const previous = lastTick.current
    lastTick.current = songId ? { songId, position } : null
    if (!isActive || !songId || previous?.songId !== songId) return
    if (Math.abs(position - previous.position) < SEEK_JUMP_SEC) return
    push({}, true)
    // Only the position moving should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position])

  // Re-state the playhead now and then, so other devices can't drift.
  React.useEffect(() => {
    if (!isActive || !isPlaying) return
    const interval = setInterval(() => push({}, true), HEARTBEAT_MS)
    return () => clearInterval(interval)
  }, [isActive, isPlaying, push])

  // ---- What the provider can ask of us -----------------------------------

  const command = React.useCallback(
    (cmd: ConnectCommand) => {
      // A dragged slider fires far faster than the relay accepts: send the
      // latest value at intervals.
      if (cmd.kind === "seek" || cmd.kind === "volume") {
        dragged.current.set(cmd.kind, cmd)
        if (!throttles.current.has(cmd.kind)) {
          const kind = cmd.kind
          throttles.current.set(
            kind,
            setTimeout(() => {
              throttles.current.delete(kind)
              const latestDrag = dragged.current.get(kind)
              if (latestDrag)
                connection.current?.send({
                  type: "command",
                  command: latestDrag,
                })
            }, DRAG_THROTTLE_MS)
          )
        }
      } else {
        connection.current?.send({ type: "command", command: cmd })
      }

      // Show the result at once; the active device's patch confirms it.
      const { remote } = info.current
      if (!remote) return
      const base: ConnectState = { ...remote, position: livePosition() }
      let optimistic: ConnectState | null = null
      switch (cmd.kind) {
        case "play":
          optimistic = { ...base, playing: true }
          break
        case "pause":
          optimistic = { ...base, playing: false }
          break
        case "seek":
          optimistic = { ...base, position: cmd.position }
          break
        case "volume":
          optimistic = { ...base, volume: cmd.volume }
          break
        case "shuffle":
          optimistic = { ...base, shuffle: cmd.on }
          break
        case "repeat":
          optimistic = { ...base, repeat: cmd.mode }
          break
        case "queue":
          optimistic = { ...base, queue: cmd.queue }
          break
        case "order":
          optimistic = { ...base, order: cmd.order }
          break
      }
      if (optimistic) publish({ remote: optimistic, at: Date.now() })
    },
    [livePosition, publish]
  )

  const transferTo = React.useCallback(
    (deviceId: string) => {
      if (deviceId === info.current.activeId) return
      // Let the latest change reach the relay first, so the new speaker
      // starts from where this one actually is.
      flush()
      // A session the relay has nothing for is seeded from this player.
      const state = info.current.remote ? undefined : (localState() ?? undefined)
      if (deviceId === me && state) claimed.current = true
      setTimeout(() => {
        connection.current?.send({
          type: "transfer",
          deviceId,
          ...(state ? { state } : {}),
        })
      }, RELAY_GAP_MS)
    },
    [flush, localState, me]
  )

  React.useEffect(() => {
    controlsRef.current = { command, transferTo }
    return () => {
      controlsRef.current = null
    }
  }, [controlsRef, command, transferTo])

  return null
}
