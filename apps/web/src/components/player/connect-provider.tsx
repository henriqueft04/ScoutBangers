import * as React from "react"

import { useAuth } from "@/hooks/useAuth"
import { useJam } from "@/hooks/useJam"
import { usePlayer } from "@/hooks/usePlayer"
import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import type { ConnectCommand } from "@/lib/connect-protocol"
import { orderWindow } from "@/lib/jam"
import { playbackCursorIndex } from "@/lib/playback-cursor"
import { supabase } from "@/lib/supabase"
import type { PlayerContextValue, QueueInput, QueueItem, RepeatMode } from "@/lib/types"

import {
  ConnectContext,
  IDLE_INFO,
  type ConnectContextValue,
  type ConnectControls,
  type ConnectInfo,
} from "./connect-context"
import { ConnectEngine } from "./connect-engine"
import { PlayerContext, PlayerProgressContext, type PlayerProgress } from "./player-context"

const REPEAT_CYCLE: Record<RepeatMode, RepeatMode> = {
  off: "all",
  all: "one",
  one: "off",
}
/** How often the remote playhead is redrawn while another device plays. */
const PROGRESS_TICK_MS = 500
const NO_PROGRESS: PlayerProgress = { position: 0, duration: 0 }

/**
 * Makes the account's devices behave as one player.
 *
 * While *another* device is the one playing, this device is a remote
 * control: `usePlayer()` and `usePlayerProgress()` below this provider serve
 * that device's song, queue and playhead, and every action — play, skip,
 * seek, queue — is sent to it as a command instead of touching the local
 * audio. Components don't know the difference. Otherwise the real player's
 * context passes through untouched.
 *
 * The socket and the sync logic live in `ConnectEngine`, which reads the
 * real player (it sits outside the overlay) and is mounted only while signed
 * in. A jam doesn't switch it off: the jam plays on this device, which then
 * simply is the active one.
 */
export function ConnectProvider({ children }: { children: React.ReactNode }) {
  const real = usePlayer()
  const { user } = useAuth()
  const { roomId } = useJam()
  const enabled = Boolean(supabase && user)
  // A jam plays on this device, so it is never a remote control meanwhile —
  // but it stays connected, so the account's other devices keep working.
  const inJam = roomId !== null

  const [reported, setReported] = React.useState<ConnectInfo>(IDLE_INFO)
  const controls = React.useRef<ConnectControls | null>(null)
  const info = enabled ? reported : IDLE_INFO

  const { remote, at, you, activeId } = info
  const outputElsewhere =
    (info.status === "connecting" || info.status === "live" || info.status === "reconnecting") &&
    !inJam &&
    you !== null &&
    activeId !== null &&
    activeId !== you &&
    remote !== null

  const activeName = outputElsewhere
    ? (info.devices.find((device) => device.id === activeId)?.name ?? null)
    : null

  const command = React.useCallback((cmd: ConnectCommand) => controls.current?.command(cmd), [])
  const transferTo = React.useCallback(
    (deviceId: string) => controls.current?.transferTo(deviceId),
    []
  )

  // ---- The remote device's playhead --------------------------------------

  const remoteSongId = remote?.songId
  const remoteIndex = React.useMemo(
    () => (remoteSongId ? real.songs.findIndex((song) => song.id === remoteSongId) : -1),
    [remoteSongId, real.songs]
  )
  const remoteSong = remoteIndex !== -1 ? real.songs[remoteIndex] : undefined
  const meta = useTrackMetadata(
    remoteSong?.id,
    outputElsewhere && Boolean(remoteSong),
    remoteSong?.modifiedTime
  )

  const [now, setNow] = React.useState(() => Date.now())
  const ticking = outputElsewhere && remote?.playing === true
  React.useEffect(() => {
    if (!ticking) return
    const interval = setInterval(() => setNow(Date.now()), PROGRESS_TICK_MS)
    return () => clearInterval(interval)
  }, [ticking])

  const duration = meta?.duration ?? 0
  const livePosition = remote
    ? remote.position + (remote.playing ? Math.max(0, now - at) / 1000 : 0)
    : 0
  const remoteProgress = React.useMemo<PlayerProgress>(
    () => ({
      position: duration > 0 ? Math.min(livePosition, duration) : livePosition,
      duration,
    }),
    [livePosition, duration]
  )

  // ---- The player context, as seen from this device ----------------------

  const overlay = React.useMemo<PlayerContextValue>(() => {
    if (!outputElsewhere || !remote) return real

    const queueNow = remote.queue
    const sendQueue = (queue: QueueInput[]) =>
      command({
        kind: "queue",
        queue: queue.map((entry) =>
          typeof entry === "string"
            ? { id: entry, by: null }
            : { id: entry.songId, by: entry.addedBy ?? null }
        ),
      })
    const upcomingAnchor = playbackCursorIndex(remote.order, remote.cursor)

    const userQueue: QueueItem[] = queueNow.map((entry, index) => ({
      key: `${index}:${entry.id}`,
      songId: entry.id,
      ...(entry.by ? { addedBy: entry.by } : {}),
    }))

    return {
      ...real,
      currentIndex: remoteIndex === -1 ? null : remoteIndex,
      isPlaying: remote.playing,
      volume: remote.volume,
      muted: false,
      shuffle: remote.shuffle,
      repeat: remote.repeat,
      userQueue,
      playbackList: remote.order,
      playbackCursorId: remote.cursor,
      playbackError: null,

      play: (index, contextSongIds) => {
        const song = real.songs[index]
        if (!song) return
        const list = contextSongIds ?? real.songs.map((s) => s.id)
        command({
          kind: "playSong",
          songId: song.id,
          list: orderWindow(list, song.id),
        })
      },
      skipTo: (songId, queueIndex) =>
        command({
          kind: "skipTo",
          songId,
          ...(queueIndex !== undefined ? { queueIndex } : {}),
        }),
      toggle: () => command({ kind: remote.playing ? "pause" : "play" }),
      next: () => command({ kind: "next" }),
      prev: () => command({ kind: "prev" }),
      seek: (seconds) => command({ kind: "seek", position: seconds }),
      setVolume: (volume) => command({ kind: "volume", volume: Math.max(0, Math.min(1, volume)) }),
      // Mute is a property of the local speaker, which isn't the one playing.
      toggleMute: () => undefined,
      toggleShuffle: () => command({ kind: "shuffle", on: !remote.shuffle }),
      cycleRepeat: () => command({ kind: "repeat", mode: REPEAT_CYCLE[remote.repeat] }),
      setRepeat: (mode) => command({ kind: "repeat", mode }),
      adoptPlayback: ({ list }) => command({ kind: "order", order: list }),

      queueAdd: (songId) => sendQueue([...userQueue, songId]),
      queueAddMany: (songIds) => sendQueue([...userQueue, ...songIds]),
      queueRemove: (index) => sendQueue(userQueue.filter((_, i) => i !== index)),
      queueMove: (from, to) => {
        if (from === to || !userQueue[from] || !userQueue[to]) return
        const next = [...userQueue]
        const [moved] = next.splice(from, 1)
        if (moved) next.splice(to, 0, moved)
        sendQueue(next)
      },
      queueSet: sendQueue,
      queueClear: () => sendQueue([]),
      reorderUpcoming: (newUpcoming) => {
        if (upcomingAnchor === -1) return
        command({
          kind: "order",
          order: [...remote.order.slice(0, upcomingAnchor + 1), ...newUpcoming],
        })
      },
      removeFromUpcoming: (songId) => {
        if (upcomingAnchor === -1 || songId === remote.songId) return
        command({
          kind: "order",
          order: remote.order.filter((id, i) => i <= upcomingAnchor || id !== songId),
        })
      },
    }
  }, [outputElsewhere, remote, remoteIndex, real, command])

  const progress = outputElsewhere ? remoteProgress : NO_PROGRESS

  const value = React.useMemo<ConnectContextValue>(
    () => ({
      status: enabled ? info.status : "idle",
      devices: info.devices,
      you,
      activeId,
      outputElsewhere,
      activeName,
      transferTo,
    }),
    [enabled, info.status, info.devices, you, activeId, outputElsewhere, activeName, transferTo]
  )

  return (
    <ConnectContext.Provider value={value}>
      <PlayerContext.Provider value={overlay}>
        <ProgressOverlay active={outputElsewhere} remote={progress}>
          {children}
        </ProgressOverlay>
      </PlayerContext.Provider>
      {enabled && user ? (
        <ConnectEngine key={user.id} inJam={inJam} onInfo={setReported} controlsRef={controls} />
      ) : null}
    </ConnectContext.Provider>
  )
}

/**
 * Serves the remote playhead in place of the real one, or lets the real
 * one through. A separate component so the real progress context is read
 * (and re-rendered at ~4 Hz) only here, not by the provider above.
 */
function ProgressOverlay({
  active,
  remote,
  children,
}: {
  active: boolean
  remote: PlayerProgress
  children: React.ReactNode
}) {
  const real = React.useContext(PlayerProgressContext)
  return (
    <PlayerProgressContext.Provider value={active ? remote : real}>
      {children}
    </PlayerProgressContext.Provider>
  )
}
