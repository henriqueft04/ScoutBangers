import * as React from "react"
import { createPortal } from "react-dom"
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValue,
  type MotionValue,
} from "framer-motion"
import { Loader2, Share2, Volume2, VolumeX, X } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { shareImage } from "@/lib/share"

import { TransitionFX } from "./fx"
import { BACK_MOTION, enterMotion } from "./transitions"
import { Grain } from "./primitives"
import { StoryContext, type SlideDef } from "./story-context"
import { useWrappedAudio } from "./use-wrapped-audio"

/** A press longer than this is a hold (pause), not a tap. */
const HOLD_MS = 220
/** Downward drag past this closes the story. */
const SWIPE_CLOSE_PX = 110

interface StoryPlayerProps {
  slides: SlideDef[]
  year: number
  onClose: () => void
}

/**
 * Full-screen, tap-through story — the Wrapped engine. Owns the slide index,
 * the timer behind the segmented progress bars, the gestures (tap left/right,
 * hold to pause, swipe down to close), the keyboard, and the soundtrack.
 *
 * The first slide waits for a tap on its "Começar" button: that tap is what
 * lets the browser start audio.
 */
export function StoryPlayer({ slides, year, onClose }: StoryPlayerProps) {
  const [index, setIndex] = React.useState(0)
  const [started, setStarted] = React.useState(false)
  const [held, setHeld] = React.useState(false)
  const [hidden, setHidden] = React.useState(false)
  const [sharing, setSharing] = React.useState(false)
  // Sound is on from the start; only the user turns it off.
  const [muted, setMuted] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)
  // How the current slide was reached: forward plays its transition, back
  // just slides in. `origin` is where the tap was (for the iris).
  const [nav, setNav] = React.useState({ dir: 1, origin: { x: 0.8, y: 0.5 } })
  const progress = useMotionValue(0)
  const slide = slides[Math.min(index, slides.length - 1)]!
  const isLast = index === slides.length - 1

  const audio = useWrappedAudio(slide.soundtrack, {
    muted,
    suspended: hidden,
  })

  const paused = !started || held || hidden || sharing

  const go = React.useCallback(
    (delta: number, origin?: { x: number; y: number }) => {
      setNav((n) => ({ dir: delta < 0 ? -1 : 1, origin: origin ?? n.origin }))
      setIndex((i) => {
        const next = Math.max(0, Math.min(slides.length - 1, i + delta))
        if (next !== i) progress.set(0)
        else if (delta < 0) progress.set(0) // restart the first slide
        return next
      })
    },
    [slides.length, progress]
  )

  // ---- timer -----------------------------------------------------------
  React.useEffect(() => {
    if (paused) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const p = progress.get() + dt / slide.duration
      if (p >= 1) {
        if (isLast) {
          progress.set(1)
          return // the summary stays up
        }
        progress.set(0)
        setNav((n) => ({ ...n, dir: 1 }))
        setIndex((i) => Math.min(slides.length - 1, i + 1))
        return
      }
      progress.set(p)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, slide, isLast, slides.length, progress])

  // ---- page visibility ---------------------------------------------------
  React.useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === "hidden")
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  // ---- body scroll lock ------------------------------------------------
  React.useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const start = React.useCallback(() => {
    // The music normally started with the first card. Opened from a link
    // (no tap yet), the browser blocked it: this tap is the one that may.
    if (audio.blocked) audio.unlock(slides[1]?.soundtrack ?? slide.soundtrack)
    setStarted(true)
    progress.set(0)
    setIndex((i) => (i === 0 ? Math.min(1, slides.length - 1) : i))
  }, [audio, slides, slide.soundtrack, progress])

  // If the browser blocked the music, the first touch or key starts it —
  // in the event the browser counts as a user gesture (spec: mousedown for a
  // mouse, pointerup for touch and pen, keydown).
  const wakeSound = React.useCallback(() => {
    if (audio.blocked && !muted) audio.unlock(slide.soundtrack)
  }, [audio, muted, slide.soundtrack])

  const toggleSound = React.useCallback(() => {
    if (audio.blocked) {
      audio.unlock(slide.soundtrack)
      setMuted(false)
    } else setMuted((m) => !m)
  }, [audio, slide.soundtrack])

  const restart = React.useCallback(() => {
    progress.set(0)
    setIndex(1)
  }, [progress])

  // ---- keyboard --------------------------------------------------------
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // A focused button handles its own Space/Enter (e.g. "Partilhar").
      const onButton = target?.tagName === "BUTTON"
      if ((e.key === " " || e.key === "Enter") && onButton) return
      const handled = ["Escape", "ArrowRight", "ArrowLeft", " ", "Enter", "m"].includes(e.key)
      if (!handled) return
      // The story owns these keys while it's open: the app shell's own
      // Space = play/pause must not also fire (it would resume the main
      // player under the story). Listening in the capture phase runs first.
      e.stopImmediatePropagation()
      // "Começar" (Enter/Space on the intro) unlocks the sound itself.
      if (started && e.key !== "Escape") wakeSound()
      if (e.key === "Escape") onClose()
      else if (!started) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          start()
        }
      } else if (e.key === "ArrowRight") go(1)
      else if (e.key === "ArrowLeft") go(-1)
      else if (e.key === " ") {
        e.preventDefault()
        setHeld((h) => !h)
      } else if (e.key === "m") toggleSound()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [go, onClose, start, started, toggleSound, wakeSound])

  // ---- gestures --------------------------------------------------------
  const press = React.useRef<{
    x: number
    y: number
    t: number
    timer: number
  } | null>(null)
  const dragY = useMotionValue(0)

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") wakeSound()
    if (!started) return
    const timer = window.setTimeout(() => setHeld(true), HOLD_MS)
    press.current = { x: e.clientX, y: e.clientY, t: performance.now(), timer }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current
    if (!p) return
    const dy = e.clientY - p.y
    if (dy > 12) {
      window.clearTimeout(p.timer)
      setHeld(true)
      dragY.set(Math.max(0, dy))
    }
  }
  const endPress = (e: React.PointerEvent, cancelled = false) => {
    if (!cancelled && e.pointerType !== "mouse") wakeSound()
    const p = press.current
    press.current = null
    if (!p) return
    window.clearTimeout(p.timer)
    const dy = e.clientY - p.y
    const wasTap = performance.now() - p.t < HOLD_MS && Math.abs(dy) < 12
    setHeld(false)
    if (dy > SWIPE_CLOSE_PX && !cancelled) {
      onClose()
      return
    }
    dragY.set(0)
    if (wasTap && !cancelled) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      go(x < 1 / 3 ? -1 : 1, { x, y: (e.clientY - rect.top) / rect.height })
    }
  }

  // ---- share -----------------------------------------------------------
  const share = React.useCallback(async () => {
    const render = slides[index]?.share
    if (!render || sharing) return
    setSharing(true)
    try {
      const blob = await render()
      const outcome = await shareImage(
        `O meu ScoutBangers Wrapped ${year}`,
        blob,
        `scoutbangers-wrapped-${year}-${slides[index]!.id}.png`
      )
      if (outcome === "copied") setToast("Imagem guardada. Publica-a onde quiseres.")
      else if (outcome === "failed") setToast("Não foi possível partilhar a imagem.")
    } catch (err) {
      console.warn("[wrapped] share failed", err)
      setToast("Não foi possível criar a imagem.")
    } finally {
      setSharing(false)
    }
  }, [index, slides, sharing, year])

  React.useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(t)
  }, [toast])

  const ctx = React.useMemo(
    () => ({
      started,
      start,
      restart,
      close: onClose,
      share,
      sharing,
      soundOn: !muted && !audio.blocked,
      toggleSound,
    }),
    [started, start, restart, onClose, share, sharing, muted, audio.blocked, toggleSound]
  )

  return createPortal(
    <MotionConfig reducedMotion="user">
      <StoryContext.Provider value={ctx}>
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`ScoutBangers Wrapped ${year}`}
          className="fixed inset-0 z-[120] flex items-stretch justify-center bg-black select-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative h-full w-full max-w-[520px] overflow-hidden touch-none sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-[28px]"
            style={{ y: dragY, color: slide.fg }}
            animate={{ backgroundColor: slide.bg }}
            transition={{ duration: 0.6 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endPress(e)}
            onPointerCancel={(e) => endPress(e, true)}
          >
            <AnimatePresence initial={false} custom={nav.dir}>
              <motion.div
                key={slide.id}
                // A size container: slides can size by the frame's height (cqh)
                // as well as its width (cqw), for short phones.
                className="absolute inset-0 overflow-hidden [container-type:size]"
                style={{ backgroundColor: slide.bg }}
                {...(nav.dir < 0 || !slide.transition
                  ? BACK_MOTION
                  : enterMotion(slide.transition, nav.origin))}
                // The outgoing slide stays put under the incoming one until
                // the transition has covered it.
                exit={{
                  opacity: 0,
                  transition: { delay: nav.dir < 0 ? 0 : 0.9, duration: 0.2 },
                }}
              >
                {slide.render()}
              </motion.div>
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {nav.dir > 0 && slide.transition ? (
                <motion.div
                  key={slide.id}
                  // Effects only: never in the way of taps, buttons or scrolling.
                  className="pointer-events-none absolute inset-0 z-[5]"
                  exit={{ opacity: 0 }}
                >
                  <TransitionFX
                    kind={slide.transition}
                    bg={slide.bg}
                    fg={slide.fg}
                    accent={slide.accent ?? slide.fg}
                    word={slide.burstWord}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>

            <Grain />

            {/* chrome */}
            <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="flex gap-1">
                {slides.map((s, i) => (
                  <Segment
                    key={s.id}
                    state={i < index ? "done" : i === index ? "active" : "todo"}
                    progress={progress}
                    color={slide.fg}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold tracking-tight opacity-80">
                  ScoutBangers Wrapped {year}
                </span>
                <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
                  <ChromeButton
                    label={muted || audio.blocked ? "Ligar som" : "Desligar som"}
                    onClick={toggleSound}
                  >
                    {muted || audio.blocked ? (
                      <VolumeX className="size-5" />
                    ) : (
                      <Volume2 className="size-5" />
                    )}
                  </ChromeButton>
                  <ChromeButton label="Fechar" onClick={onClose}>
                    <X className="size-5" />
                  </ChromeButton>
                </div>
              </div>
            </div>

            {slide.share ? (
              <div
                className="absolute inset-x-0 bottom-0 z-10 flex justify-center pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => void share()}
                  disabled={sharing}
                  className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg outline-offset-2 transition-transform active:scale-95 disabled:opacity-70"
                  style={{ backgroundColor: slide.fg, color: slide.bg }}
                >
                  {sharing ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
                  Partilhar
                </button>
              </div>
            ) : null}

            <AnimatePresence>
              {toast ? (
                <motion.p
                  role="status"
                  className="absolute inset-x-6 bottom-20 z-20 rounded-xl bg-black/80 px-4 py-3 text-center text-sm text-white"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  {toast}
                </motion.p>
              ) : null}
            </AnimatePresence>

            {held && started ? (
              <span className="sr-only" role="status">
                Em pausa
              </span>
            ) : null}
          </motion.div>
        </motion.div>
      </StoryContext.Provider>
    </MotionConfig>,
    document.body
  )
}

function Segment({
  state,
  progress,
  color,
}: {
  state: "done" | "active" | "todo"
  progress: MotionValue<number>
  color: string
}) {
  return (
    <div
      className="h-[3px] flex-1 overflow-hidden rounded-full"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 30%, transparent)` }}
    >
      <motion.div
        className="h-full origin-left"
        style={{
          backgroundColor: color,
          scaleX: state === "active" ? progress : state === "done" ? 1 : 0,
        }}
      />
    </div>
  )
}

function ChromeButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-10 items-center justify-center rounded-full transition-colors",
        "hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-current"
      )}
    >
      {children}
    </button>
  )
}
