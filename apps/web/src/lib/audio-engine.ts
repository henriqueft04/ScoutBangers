/**
 * Web Audio engine that wraps the player's HTML5 `<audio>` decks.
 *
 * Why this exists: HTML5 audio elements own their own audio session per
 * element. iOS aggressively revokes that session whenever it sees a brief
 * silent gap (e.g. between pausing one element and another starting),
 * which manifests as the lock-screen player blinking out and audio
 * stuttering on song changes.
 *
 * A single `AudioContext` owns ONE audio session for the whole app.
 * As long as we keep the context in `running` state, the OS treats us as
 * a continuously-active audio app — gaps in actual audio output don't
 * count, only context state does. Each `<audio>` element is wrapped by a
 * `MediaElementAudioSourceNode` and routed through a per-deck `GainNode`
 * for volume / fade control. Audio still loads and decodes via the
 * element (so range requests, seeking, MediaSession all work as before),
 * but output flows through the Web Audio graph.
 *
 * Usage:
 *   1. Call `attach(audio)` once per audio element after it mounts.
 *      Internally creates the context lazily on first attach.
 *   2. Call `start()` from a user gesture handler (button click, etc.)
 *      to resume the context — required by browser autoplay policy.
 *   3. Use `setVolume`, `fadeVolume`, `cancelFade` instead of touching
 *      `audio.volume` directly. The HTML5 `audio.volume` is bypassed
 *      once an element is wrapped in `MediaElementSource`.
 *
 * Caveats:
 *   - `createMediaElementSource(audio)` can only be called once per
 *     element. We track attached elements and skip duplicate calls.
 *   - On Safari (notably older iOS), Web Audio + MediaElementSource
 *     requires the audio element to NOT be cross-origin. Same-origin
 *     `/api/stream/*` URLs are fine.
 */

interface DeckState {
  source: MediaElementAudioSourceNode
  gain: GainNode
  /** ms timestamp of the most recent fade end, or 0 if no fade active. */
  fadeUntil: number
}

/**
 * iOS Safari (including PWA / standalone) suspends the AudioContext when the
 * page is backgrounded. Once an <audio> element is wrapped by
 * createMediaElementSource(), its output is *captured* by the Web Audio graph
 * — so a suspended context means silence, even though a plain <audio> would
 * have continued playing in the background. We therefore skip the engine
 * entirely on iOS and let the native <audio> path handle playback (it stays
 * alive on lock-screen and during app-switching).
 */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS 13+ reports as Mac; disambiguate via touch points.
  return ua.includes("Mac") && (navigator.maxTouchPoints ?? 0) > 1
}

class AudioEngine {
  private context: AudioContext | null = null
  private decks = new Map<HTMLAudioElement, DeckState>()
  /** Pending elements queued before the context was created. */
  private pending = new Set<HTMLAudioElement>()
  /** Silent oscillator that keeps the audio thread continuously active. */
  private keepalive: OscillatorNode | null = null
  /** When true, all engine ops are no-ops and audio plays natively. */
  private readonly disabled = isIOS()

  /** True when the context exists and is running (audio session held). */
  get isRunning(): boolean {
    return this.context?.state === "running"
  }

  /**
   * Resume / create the AudioContext. Must be invoked from inside a
   * user-gesture handler the first time, otherwise the context gets
   * stuck in `suspended` state on most browsers. Subsequent calls are
   * cheap no-ops.
   */
  start(): void {
    if (typeof window === "undefined") return
    if (this.disabled) return
    if (!this.context) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return
      try {
        this.context = new Ctor()
      } catch {
        return
      }
      // Drain any elements that were attached before start().
      for (const audio of this.pending) {
        this.attachInternal(audio)
      }
      this.pending.clear()
      this.startKeepalive()
    }
    if (this.context.state === "suspended") {
      void this.context.resume().catch(() => undefined)
    }
  }

  /**
   * Drive the destination with an inaudible 0-frequency oscillator.
   * Web Audio's audio thread then has continuous samples to render
   * even when both deck sources are paused — without it, iOS sees
   * the destination flat-line during a song change and revokes the
   * audio session, blanking the lock-screen player. The signal is at
   * gain 0 so the speaker output is identical to silence; the only
   * thing it does is keep the session alive.
   */
  private startKeepalive(): void {
    if (!this.context || this.keepalive) return
    try {
      const osc = this.context.createOscillator()
      const gain = this.context.createGain()
      gain.gain.value = 0
      osc.frequency.value = 440
      osc.connect(gain)
      gain.connect(this.context.destination)
      osc.start()
      this.keepalive = osc
    } catch {
      /* best-effort */
    }
  }

  /**
   * Wrap an HTMLAudioElement so its output flows through Web Audio.
   * Safe to call before `start()` — the wrap is deferred until the
   * context exists.
   */
  attach(audio: HTMLAudioElement): void {
    if (!audio) return
    if (this.disabled) return
    if (this.decks.has(audio)) return
    if (!this.context) {
      this.pending.add(audio)
      return
    }
    this.attachInternal(audio)
  }

  private attachInternal(audio: HTMLAudioElement): void {
    if (!this.context) return
    if (this.decks.has(audio)) return
    let source: MediaElementAudioSourceNode
    try {
      source = this.context.createMediaElementSource(audio)
    } catch {
      // Already attached on a different engine instance, or audio is
      // invalid. Bail rather than crash.
      return
    }
    const gain = this.context.createGain()
    gain.gain.value = 1
    source.connect(gain)
    gain.connect(this.context.destination)
    this.decks.set(audio, { source, gain, fadeUntil: 0 })
  }

  /**
   * Hard-set volume for an audio element. Cancels any in-flight fade.
   * Falls back to setting `audio.volume` directly when the engine
   * hasn't been started yet (still useful for pre-start defaults).
   */
  setVolume(audio: HTMLAudioElement, value: number): void {
    const v = clamp(value)
    const deck = this.decks.get(audio)
    if (!deck || !this.context) {
      audio.volume = v
      return
    }
    const now = this.context.currentTime
    deck.gain.gain.cancelScheduledValues(now)
    deck.gain.gain.setValueAtTime(v, now)
    deck.fadeUntil = 0
  }

  /**
   * Smoothly ramp volume to `target` over `durationMs`. Uses Web
   * Audio's audio thread so the ramp is sample-accurate and not
   * blocked by main-thread JS — including when the page is hidden
   * and `requestAnimationFrame` is suspended.
   *
   * Returns a cancellable handle compatible with the previous
   * fade.ts API so the player can drop it in unchanged.
   */
  fadeVolume(
    audio: HTMLAudioElement,
    target: number,
    durationMs: number
  ): FadeHandle {
    const deck = this.decks.get(audio)
    if (!deck || !this.context) {
      // Engine not ready: fall back to a hard set.
      audio.volume = clamp(target)
      return noopHandle()
    }
    const ctx = this.context
    const now = ctx.currentTime
    const current = deck.gain.gain.value
    const t = clamp(target)
    deck.gain.gain.cancelScheduledValues(now)
    deck.gain.gain.setValueAtTime(current, now)
    deck.gain.gain.linearRampToValueAtTime(t, now + durationMs / 1000)
    deck.fadeUntil = now + durationMs / 1000
    let cancelled = false
    let resolveFn: (() => void) | undefined
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve
      // Resolve via setTimeout — Web Audio doesn't expose ramp-end
      // events. Slight imprecision is fine; nothing we do depends on
      // sub-frame accuracy of the resolution timing.
      setTimeout(() => {
        if (cancelled) return
        resolve()
      }, durationMs)
    })
    return {
      cancel: () => {
        if (cancelled) return
        cancelled = true
        const cancelTime = ctx.currentTime
        const valueNow = deck.gain.gain.value
        deck.gain.gain.cancelScheduledValues(cancelTime)
        deck.gain.gain.setValueAtTime(valueNow, cancelTime)
        deck.fadeUntil = 0
        resolveFn?.()
      },
      promise,
    }
  }

  /** Return the current effective gain (0..1) for diagnostics. */
  getVolume(audio: HTMLAudioElement): number {
    const deck = this.decks.get(audio)
    if (!deck || !this.context) return audio.volume
    return clamp(deck.gain.gain.value)
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export interface FadeHandle {
  cancel: () => void
  promise: Promise<void>
}

function noopHandle(): FadeHandle {
  return { cancel: () => undefined, promise: Promise.resolve() }
}

export const audioEngine = new AudioEngine()
