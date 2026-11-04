/**
 * Wire protocol between the app and the account relay (workers/connect) —
 * the "Spotify Connect" channel that lets one signed-in account's devices
 * share a playback session. Like jam-protocol.ts this file is imported by
 * the worker too, so it stays free of DOM / app imports.
 *
 * One account = one session. Exactly one device is *active* (the one making
 * sound); it is the source of truth and pushes `patch`es. Every other device
 * mirrors the state and sends `command`s, which the relay forwards to the
 * active device. A `transfer` hands the session to another device.
 */

import {
  FIELD_VALIDATORS,
  MAX_QUEUE,
  isRecord,
  parseJson,
  type JamQueueEntry,
  type JamRepeat,
  type JamState,
} from "./jam-protocol"

/** A jam state plus the output volume, which a controller can also set. */
export interface ConnectState extends JamState {
  /** 0..1 */
  volume: number
}

export type ConnectPatch = Partial<ConnectState>

export interface ConnectDevice {
  id: string
  name: string
}

export type ConnectCommand =
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "next" }
  | { kind: "prev" }
  | { kind: "seek"; position: number }
  | { kind: "volume"; volume: number }
  | { kind: "shuffle"; on: boolean }
  | { kind: "repeat"; mode: JamRepeat }
  /** Start a song, optionally with the list that should follow it. */
  | { kind: "playSong"; songId: string; list?: string[] }
  /** Jump to a song already queued or upcoming, without rebuilding the list. */
  | { kind: "skipTo"; songId: string; queueIndex?: number }
  /** Replace the explicit queue. */
  | { kind: "queue"; queue: JamQueueEntry[] }
  /** Replace the playback order (reordering or removing upcoming songs). */
  | { kind: "order"; order: string[] }

/** Just the moving parts, so a device change doesn't resend the whole state. */
export interface ConnectLive {
  songId: string
  position: number
  playing: boolean
}

export type ConnectClientMessage =
  /** First message on every socket; says which device this is. */
  | { type: "hello"; deviceId: string; name: string }
  /** Active device only: fields of the state that changed. */
  | { type: "patch"; patch: ConnectPatch }
  /** Controller → active device, via the relay. */
  | { type: "command"; command: ConnectCommand }
  /**
   * Make `deviceId` the active one. `state` — a complete state — seeds or
   * replaces the session, for when the relay has nothing (or something stale,
   * like a device that kept playing through a dropped connection).
   */
  | { type: "transfer"; deviceId: string; state?: ConnectState }
  /** "Where is everyone?" — on return from the background. Answered with a `hello`. */
  | { type: "resync" }

export type ConnectServerMessage =
  /** The full live state: after `hello`, and as the reply to `resync`. */
  | {
      type: "hello"
      rev: number
      state: ConnectState | null
      /** Id of the receiving device. */
      you: string
      devices: ConnectDevice[]
      activeId: string | null
    }
  /** The active device changed the state. `rev` is the previous one + 1. */
  | { type: "sync"; rev: number; patch: ConnectPatch }
  /** Devices joined / left, or the session moved. Carries the live playhead. */
  | {
      type: "devices"
      rev: number
      devices: ConnectDevice[]
      activeId: string | null
      live: ConnectLive | null
    }
  /** A controller asked this (active) device to do something. */
  | { type: "command"; from: string; command: ConnectCommand }
  /** A command had nowhere to go: no device is active. */
  | { type: "unreachable" }

export const MAX_DEVICES = 8
export const MAX_DEVICE_NAME_CHARS = 40
export const DEVICE_ID_PATTERN = /^[\w-]{8,64}$/

/** WebSocket subprotocols: the app offers both; the relay echoes the first. */
export const CONNECT_SUBPROTOCOL = "scoutbangers.connect"
export const BEARER_SUBPROTOCOL_PREFIX = "bearer."

const STATE_VALIDATORS: Record<keyof ConnectState, (value: unknown) => boolean> = {
  ...FIELD_VALIDATORS,
  volume: (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1,
}
const STATE_KEYS = Object.keys(STATE_VALIDATORS) as (keyof ConnectState)[]

export function isConnectState(value: unknown): value is ConnectState {
  return isRecord(value) && STATE_KEYS.every((key) => STATE_VALIDATORS[key](value[key]))
}

export function isConnectPatch(value: unknown): value is ConnectPatch {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length > 0 &&
    keys.every(
      (key) =>
        // Own keys only: `"constructor" in obj` is true for every object.
        Object.hasOwn(STATE_VALIDATORS, key) &&
        STATE_VALIDATORS[key as keyof ConnectState](value[key])
    )
  )
}

const isDevice = (value: unknown): value is ConnectDevice =>
  isRecord(value) && typeof value.id === "string" && typeof value.name === "string"

const isDevices = (value: unknown): value is ConnectDevice[] =>
  Array.isArray(value) && value.every(isDevice)

const isPosition = FIELD_VALIDATORS.position

function isLive(value: unknown): value is ConnectLive {
  return (
    isRecord(value) &&
    FIELD_VALIDATORS.songId(value.songId) &&
    isPosition(value.position) &&
    typeof value.playing === "boolean"
  )
}

export function isConnectCommand(value: unknown): value is ConnectCommand {
  if (!isRecord(value)) return false
  switch (value.kind) {
    case "play":
    case "pause":
    case "next":
    case "prev":
      return true
    case "seek":
      return isPosition(value.position)
    case "volume":
      return STATE_VALIDATORS.volume(value.volume)
    case "shuffle":
      return typeof value.on === "boolean"
    case "repeat":
      return FIELD_VALIDATORS.repeat(value.mode)
    case "playSong":
      return (
        FIELD_VALIDATORS.songId(value.songId) &&
        (value.list === undefined || FIELD_VALIDATORS.order(value.list))
      )
    case "skipTo":
      return (
        FIELD_VALIDATORS.songId(value.songId) &&
        (value.queueIndex === undefined ||
          (Number.isInteger(value.queueIndex) &&
            (value.queueIndex as number) >= 0 &&
            (value.queueIndex as number) < MAX_QUEUE))
      )
    case "queue":
      return FIELD_VALIDATORS.queue(value.queue)
    case "order":
      return FIELD_VALIDATORS.order(value.order)
    default:
      return false
  }
}

export function parseConnectClientMessage(raw: unknown): ConnectClientMessage | null {
  const msg = parseJson(raw)
  if (!msg) return null
  switch (msg.type) {
    case "hello":
      if (typeof msg.deviceId !== "string" || !DEVICE_ID_PATTERN.test(msg.deviceId)) {
        return null
      }
      return {
        type: "hello",
        deviceId: msg.deviceId,
        // Free-form text from the network: clean it here rather than at each use.
        name: typeof msg.name === "string" ? msg.name.trim().slice(0, MAX_DEVICE_NAME_CHARS) : "",
      }
    case "patch":
      return isConnectPatch(msg.patch) ? { type: "patch", patch: msg.patch } : null
    case "command":
      return isConnectCommand(msg.command) ? { type: "command", command: msg.command } : null
    case "transfer":
      if (typeof msg.deviceId !== "string" || !DEVICE_ID_PATTERN.test(msg.deviceId)) {
        return null
      }
      if (msg.state === undefined) return { type: "transfer", deviceId: msg.deviceId }
      return isConnectState(msg.state)
        ? { type: "transfer", deviceId: msg.deviceId, state: msg.state }
        : null
    case "resync":
      return { type: "resync" }
    default:
      return null
  }
}

export function parseConnectServerMessage(raw: unknown): ConnectServerMessage | null {
  const msg = parseJson(raw)
  if (!msg) return null
  switch (msg.type) {
    case "hello":
      if (
        typeof msg.rev === "number" &&
        typeof msg.you === "string" &&
        isDevices(msg.devices) &&
        (msg.activeId === null || typeof msg.activeId === "string") &&
        (msg.state === null || isConnectState(msg.state))
      ) {
        return {
          type: "hello",
          rev: msg.rev,
          state: msg.state,
          you: msg.you,
          devices: msg.devices,
          activeId: msg.activeId,
        }
      }
      return null
    case "sync":
      return typeof msg.rev === "number" && isConnectPatch(msg.patch)
        ? { type: "sync", rev: msg.rev, patch: msg.patch }
        : null
    case "devices":
      if (
        typeof msg.rev === "number" &&
        isDevices(msg.devices) &&
        (msg.activeId === null || typeof msg.activeId === "string") &&
        (msg.live === null || isLive(msg.live))
      ) {
        return {
          type: "devices",
          rev: msg.rev,
          devices: msg.devices,
          activeId: msg.activeId,
          live: msg.live,
        }
      }
      return null
    case "command":
      return typeof msg.from === "string" && isConnectCommand(msg.command)
        ? { type: "command", from: msg.from, command: msg.command }
        : null
    case "unreachable":
      return { type: "unreachable" }
    default:
      return null
  }
}
