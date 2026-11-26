import * as React from "react"

import { streamUrl } from "@/lib/audio-url"
import { peekTrackMetadata } from "@/lib/track-metadata"

const VOLUME = 0.85
const FADE_MS = 600
/** Where a clip starts: into the song, past the intro, near the chorus. */
const START_FRACTION = 0.35
const FALLBACK_START_S = 40

function clipStart(songId: string): number {
  const duration = peekTrackMetadata(songId)?.duration
  return duration && duration > 20 ? duration * START_FRACTION : FALLBACK_START_S
}

function ramp(audio: HTMLAudioElement, to: number, done?: () => void): () => void {
  const from = audio.volume
  const t0 = performance.now()
  let raf = 0
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / FADE_MS)
    // iOS ignores `volume` (read-only, always 1): the fade becomes a cut.
    try {
      audio.volume = from + (to - from) * k
    } catch {
      /* ignore */
    }
    if (k < 1) raf = requestAnimationFrame(step)
    else done?.()
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

function makeDeck(): HTMLAudioElement {
  const a = new Audio()
  a.preload = "auto"
  a.loop = true
  a.volume = 0
  return a
}

/**
 * The two decks live for the whole app session, not per story: a deck that
 * has played once from a tap may play again later without one (iOS rule).
 * That's what lets the music start on the first card — the tap on the
 * Wrapped banner unlocks them before the story even mounts.
 */
let shared: [HTMLAudioElement, HTMLAudioElement] | null = null
const getDecks = () => (shared ??= [makeDeck(), makeDeck()])

/**
 * A 50 ms silent WAV, built once: something real to play() while unlocking.
 * A blob: URL, not data: — the CSP's media-src (public/_headers) allows
 * blob: but not data:.
 */
let silence: string | null = null
function silentWav(): string {
  if (silence) return silence
  const samples = 400 // 8 kHz, 8-bit mono
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const ascii = (o: number, s: string) =>
    [...s].forEach((c, i) => (bytes[o + i] = c.charCodeAt(0)))
  ascii(0, "RIFF")
  view.setUint32(4, 36 + samples, true)
  ascii(8, "WAVEfmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, 8000, true)
  view.setUint32(28, 8000, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  ascii(36, "data")
  view.setUint32(40, samples, true)
  bytes.fill(128, 44) // 8-bit silence is the midpoint
  silence = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }))
  return silence
}

/**
 * Call synchronously inside a tap handler (the Wrapped banner, "Começar"):
 * plays silence on both decks so the browser lets them play music later.
 * Skips a deck that is already playing.
 */
export function primeWrappedAudio(): void {
  for (const deck of getDecks()) {
    if (!deck.paused) continue
    deck.src = silentWav()
    void deck
      .play()
      .then(() => deck.pause())
      .catch(() => undefined)
  }
}

const isBlocked = (err: unknown) =>
  err instanceof DOMException && err.name === "NotAllowedError"

interface WrappedAudio {
  /**
   * True when the browser refused to start the music on its own (the story
   * was opened from a link, with no tap before it). `unlock` fixes it.
   */
  blocked: boolean
  /** Must run inside a tap handler. Starts `songId` with sound. */
  unlock: (songId: string | undefined) => void
}

/**
 * Background soundtrack for the Wrapped story: two `<audio>` decks that
 * crossfade whenever the slide's song changes. A slide with the same song
 * as the previous one keeps it playing rather than restarting. Starts with
 * the first card; if the browser blocks that, `blocked` says so.
 */
export function useWrappedAudio(
  songId: string | undefined,
  { muted, suspended }: { muted: boolean; suspended: boolean }
): WrappedAudio {
  const active = React.useRef(0)
  const playing = React.useRef<string | undefined>(undefined)
  const cancelFades = React.useRef<(() => void)[]>([])
  const [blocked, setBlocked] = React.useState(false)
  const mutedRef = React.useRef(muted)

  const switchTo = React.useCallback((id: string | undefined) => {
    if (id === playing.current) return
    const pair = getDecks()
    const out = pair[active.current]
    playing.current = id
    cancelFades.current.forEach((c) => c())
    cancelFades.current = []
    cancelFades.current.push(ramp(out, 0, () => out.pause()))
    if (!id) return

    active.current = 1 - active.current
    const deck = pair[active.current]
    deck.src = streamUrl(id)
    deck.muted = mutedRef.current
    deck.volume = 0
    const seek = () => {
      try {
        const start = clipStart(id)
        if (!Number.isFinite(deck.duration) || start < deck.duration - 5) {
          deck.currentTime = start
        }
      } catch {
        /* seeking before data — harmless */
      }
    }
    deck.addEventListener("loadedmetadata", seek, { once: true })
    deck.play().then(
      () => setBlocked(false),
      (err: unknown) => {
        if (!isBlocked(err) || playing.current !== id) return
        // Not allowed without a tap: forget it, so unlock() can retry.
        playing.current = undefined
        setBlocked(true)
      }
    )
    cancelFades.current.push(ramp(deck, VOLUME))
  }, [])

  const unlock = React.useCallback(
    (id: string | undefined) => {
      primeWrappedAudio()
      playing.current = undefined
      setBlocked(false)
      switchTo(id)
    },
    [switchTo]
  )

  // Follow the slide's soundtrack — from the very first card.
  React.useEffect(() => {
    if (!blocked) switchTo(songId)
  }, [songId, blocked, switchTo])

  React.useEffect(() => {
    mutedRef.current = muted
    getDecks()[active.current].muted = muted
  }, [muted])

  // Tab hidden / share sheet open: hold the music.
  React.useEffect(() => {
    if (blocked || !playing.current) return
    const deck = getDecks()[active.current]
    if (suspended) deck.pause()
    else void deck.play().catch(() => undefined)
  }, [suspended, blocked])

  React.useEffect(
    () => () => {
      cancelFades.current.forEach((c) => c())
      for (const deck of getDecks()) {
        deck.pause()
        deck.volume = 0
      }
      playing.current = undefined
    },
    []
  )

  return { blocked, unlock }
}
