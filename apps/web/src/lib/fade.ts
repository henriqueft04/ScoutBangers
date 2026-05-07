/**
 * Animate `audio.volume` from its current value to `target` over `durationMs`
 * using `requestAnimationFrame`. Returns a `cancel` handle that aborts the
 * ramp and leaves the audio at whatever volume it had reached.
 *
 * Web Audio API would give us sample-accurate fades via `GainNode`, but rAF
 * is more than smooth enough for a 2-second crossfade and avoids the
 * `MediaElementSource` capture (which prevents normal `<audio>` playback in
 * some browsers).
 */
export interface FadeHandle {
  cancel: () => void
  promise: Promise<void>
}

export function fadeVolume(
  audio: HTMLAudioElement,
  target: number,
  durationMs: number
): FadeHandle {
  const start = performance.now()
  const from = audio.volume
  let raf = 0
  let resolveFn: (() => void) | undefined
  let cancelled = false

  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve
    const tick = (now: number) => {
      if (cancelled) {
        resolve()
        return
      }
      const progress = Math.min((now - start) / Math.max(1, durationMs), 1)
      audio.volume = clamp(from + (target - from) * progress)
      if (progress < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        audio.volume = clamp(target)
        resolve()
      }
    }
    raf = requestAnimationFrame(tick)
  })

  return {
    cancel: () => {
      cancelled = true
      cancelAnimationFrame(raf)
      resolveFn?.()
    },
    promise,
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v))
}
