import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"

import { useTour } from "@/hooks/useTour"

import type { TourSide, TourStep } from "./tour-context"

/**
 * Padding around the target element inside the spotlight cutout. Big
 * enough that the cutout doesn't crowd the highlighted thing, small
 * enough that the target still feels singled out.
 */
const SPOTLIGHT_PADDING = 8
/** Spotlight corner radius — softer than a hard rect against the dim. */
const SPOTLIGHT_RADIUS = 14
/** Gap between the spotlight and the tooltip card. */
const TOOLTIP_GAP = 14
/** Fixed tooltip width (approx). Used for auto-positioning math. */
const TOOLTIP_WIDTH = 320
/** Estimated tooltip height. We don't know it before render; this is a
 *  decent guess for positioning, and we clamp to viewport so a wrong
 *  guess can't push the card offscreen. */
const TOOLTIP_HEIGHT_GUESS = 200
const TOOLTIP_VIEWPORT_MARGIN = 12
/**
 * Max time to wait for a step's target to appear in the DOM before
 * giving up and auto-advancing. Covers the case where the target only
 * exists on a different viewport (e.g. a mobile-only element while the
 * tour is replayed on desktop) — leaving the user stuck on a centered
 * tooltip with no spotlight would be the wrong call.
 */
const TARGET_FALLBACK_MS = 5000

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Track the bounding rect of `selector`. Returns null while the target
 * hasn't mounted yet (lazy chunks, conditional renders) and updates on
 * resize / scroll / layout shifts. The MutationObserver fallback means
 * the engine can step into a route, set the step's target selector,
 * and trust that we'll pick the element up once it appears — no
 * explicit "wait for chunk" plumbing.
 */
function useTargetRect(selector: string | null): TargetRect | null {
  const [rect, setRect] = React.useState<TargetRect | null>(null)

  React.useEffect(() => {
    if (!selector) {
      setRect(null)
      return
    }

    let cancelled = false
    let detach: (() => void) | undefined

    const measure = (el: Element) => {
      if (cancelled) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }

    const attach = (el: Element) => {
      measure(el)
      const onChange = () => measure(el)
      const ro = new ResizeObserver(onChange)
      ro.observe(el)
      // Scroll listeners use capture so nested scroll containers (the
      // main content area is its own scroll context on desktop) also
      // bump the rect.
      window.addEventListener("scroll", onChange, true)
      window.addEventListener("resize", onChange)
      // Catch slow layout shifts (fonts, lazy images) that no event
      // fires for. Cheap — just reads layout.
      const tick = window.setInterval(onChange, 500)
      detach = () => {
        ro.disconnect()
        window.removeEventListener("scroll", onChange, true)
        window.removeEventListener("resize", onChange)
        window.clearInterval(tick)
      }
    }

    // Prefer the first VISIBLE match. Several selectors (e.g.
    // [data-tour-id="nav-music"]) intentionally appear on both the
    // desktop sidebar and the mobile bottom nav — only one is
    // actually rendered at any viewport, but both are in the DOM. A
    // plain querySelector returns whichever appears first in source
    // order, which on mobile is the (display:none) desktop sidebar,
    // giving a zero-size rect and an invisible spotlight.
    const findVisible = (): Element | null => {
      const matches = document.querySelectorAll(selector)
      for (const el of matches) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) return el
      }
      return null
    }

    const existing = findVisible()
    if (existing) {
      attach(existing)
    } else {
      const obs = new MutationObserver(() => {
        const found = findVisible()
        if (found) {
          obs.disconnect()
          attach(found)
        }
      })
      obs.observe(document.body, { childList: true, subtree: true })
      detach = () => obs.disconnect()
    }

    return () => {
      cancelled = true
      detach?.()
    }
  }, [selector])

  return rect
}

interface TooltipPosition {
  x: number
  y: number
  side: Exclude<TourSide, "auto">
}

function pickSide(
  rect: TargetRect,
  preferred: TourSide | undefined,
  tooltipHeight: number
): Exclude<TourSide, "auto"> {
  if (preferred && preferred !== "auto") return preferred
  const vw = window.innerWidth
  const vh = window.innerHeight
  const space: Array<[Exclude<TourSide, "auto">, number]> = [
    ["bottom", vh - (rect.top + rect.height) - tooltipHeight - TOOLTIP_GAP],
    ["top", rect.top - tooltipHeight - TOOLTIP_GAP],
    ["right", vw - (rect.left + rect.width) - TOOLTIP_WIDTH - TOOLTIP_GAP],
    ["left", rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP],
  ]
  space.sort((a, b) => b[1] - a[1])
  return space[0]![0]
}

function computeTooltipPosition(
  rect: TargetRect | null,
  side: TourSide | undefined,
  tooltipHeight: number
): TooltipPosition {
  // No target: centered welcome card.
  if (!rect) {
    return {
      x: window.innerWidth / 2 - TOOLTIP_WIDTH / 2,
      y: window.innerHeight / 2 - tooltipHeight / 2,
      side: "bottom",
    }
  }
  const chosen = pickSide(rect, side, tooltipHeight)
  let x: number
  let y: number
  switch (chosen) {
    case "top":
      x = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
      y = rect.top - tooltipHeight - TOOLTIP_GAP
      break
    case "bottom":
      x = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
      y = rect.top + rect.height + TOOLTIP_GAP
      break
    case "left":
      x = rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP
      y = rect.top + rect.height / 2 - tooltipHeight / 2
      break
    case "right":
      x = rect.left + rect.width + TOOLTIP_GAP
      y = rect.top + rect.height / 2 - tooltipHeight / 2
      break
  }
  const maxX = window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_VIEWPORT_MARGIN
  const maxY = window.innerHeight - tooltipHeight - TOOLTIP_VIEWPORT_MARGIN
  x = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(maxX, x))
  y = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(maxY, y))
  return { x, y, side: chosen }
}

interface OverlayProps {
  step: TourStep
}

export function TourOverlay({ step }: OverlayProps) {
  const { stepIndex, totalSteps, next, prev, skip } = useTour()
  const rect = useTargetRect(step.target)

  // We measure the tooltip's actual height after it renders so the
  // position math doesn't rely on the constant guess. On the very
  // first paint the guess is used; the second paint uses the real
  // height, which animates into place via framer-motion.
  const tooltipRef = React.useRef<HTMLDivElement>(null)
  const [tooltipHeight, setTooltipHeight] = React.useState(TOOLTIP_HEIGHT_GUESS)
  React.useLayoutEffect(() => {
    if (tooltipRef.current) {
      const h = tooltipRef.current.getBoundingClientRect().height
      if (h > 0 && Math.abs(h - tooltipHeight) > 4) setTooltipHeight(h)
    }
  })

  // Scroll the target into view when a new step starts. Without this,
  // the spotlight would animate to an offscreen rect and the tooltip
  // would pin against the viewport edge.
  React.useEffect(() => {
    if (!step.target) return
    const el = document.querySelector(step.target)
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [step.target, step.id])

  // Target-not-found fallback: if a selector step never resolves to an
  // element (e.g. the home stats button only exists on the mobile
  // FriendsFeed carousel — desktop replays of the tour would otherwise
  // stall here), auto-advance after a generous wait so the rest of the
  // tour keeps flowing.
  React.useEffect(() => {
    if (!step.target) return
    if (rect) return
    const timer = window.setTimeout(() => {
      next()
    }, TARGET_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [step.target, step.id, rect, next])

  const position = React.useMemo(
    () => computeTooltipPosition(rect, step.side, tooltipHeight),
    [rect, step.side, tooltipHeight]
  )

  // Interactive ("click") steps don't block pointer events on the
  // backdrop — the user needs to be able to tap the highlighted thing
  // to advance. The cutout is visually identical either way.
  const interactive = step.advanceOn === "click"

  // Wire up the click-to-advance listener for interactive steps.
  React.useEffect(() => {
    if (!interactive || !step.target) return
    const el = document.querySelector(step.target)
    if (!el) return
    const onClick = () => next()
    el.addEventListener("click", onClick, { once: true })
    return () => el.removeEventListener("click", onClick)
  }, [interactive, step.target, step.id, next])

  // Spotlight rect in screen coords. When `rect` is null (welcome
  // step), collapse to a zero-area off-screen point — the backdrop
  // becomes a uniform dim with no hole.
  const spotlight = rect
    ? {
        x: rect.left - SPOTLIGHT_PADDING,
        y: rect.top - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : { x: -10, y: -10, width: 0, height: 0 }

  const isLastStep = stepIndex >= totalSteps - 1
  const isFirstStep = stepIndex === 0

  return (
    <div
      // High z-index so the overlay sits above the player bar / fullscreen
      // sheet. pointer-events is on the children, not here — lets us
      // selectively block clicks on the dim area without touching the
      // tooltip card or the (interactive) target.
      className="pointer-events-none fixed inset-0 z-[100]"
      aria-modal="true"
      role="dialog"
      aria-label={step.title}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        // The backdrop rect inside this SVG handles pointer-events; the
        // SVG itself is transparent to events otherwise.
      >
        <defs>
          <mask id="scoutbangers-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <motion.rect
              initial={false}
              animate={{
                x: spotlight.x,
                y: spotlight.y,
                width: spotlight.width,
                height: spotlight.height,
              }}
              transition={{ type: "spring", stiffness: 220, damping: 28 }}
              rx={SPOTLIGHT_RADIUS}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.62)"
          mask="url(#scoutbangers-tour-mask)"
          style={{
            pointerEvents: interactive ? "none" : "auto",
          }}
        />
      </svg>

      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          ref={tooltipRef}
          initial={{ opacity: 0, scale: 0.96, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="pointer-events-auto absolute"
          style={{
            left: position.x,
            top: position.y,
            width: TOOLTIP_WIDTH,
          }}
        >
          <div className="border-border/60 bg-background text-foreground rounded-2xl border p-4 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-muted-foreground text-[11px] font-medium tabular-nums">
                {stepIndex + 1} / {totalSteps}
              </span>
              <button
                type="button"
                onClick={skip}
                className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors"
              >
                Saltar
              </button>
            </div>
            <h3 className="text-sm font-semibold leading-tight">{step.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-[13px] leading-snug">
              {step.body}
            </p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={prev}
                disabled={isFirstStep}
                className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>
              {interactive ? (
                <span className="text-muted-foreground text-[11px] italic">
                  Toca para continuar
                </span>
              ) : (
                <button
                  type="button"
                  onClick={next}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
                >
                  {isLastStep ? "Concluir" : "Seguinte"}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
