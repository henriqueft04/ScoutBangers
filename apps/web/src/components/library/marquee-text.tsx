import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

interface MarqueeTextProps {
  children: string
  className?: string
  /** Disable the animation regardless of overflow. The title still shows
   *  start-truncated with an ellipsis if it doesn't fit. */
  enabled?: boolean
}

/**
 * Single-line text that scrolls horizontally when the content is wider than
 * the container. The travel distance is measured in JS (matching the actual
 * overflow) and exposed as the `--marquee-distance` CSS variable, which the
 * `marquee` keyframe in `globals.css` consumes.
 *
 * Behaviour by case:
 *   - text fits: rendered as a content-width inline-block, so callers'
 *     alignment (e.g. `text-center` in the fullscreen view) still works.
 *   - text overflows AND `enabled`: animates start → end → start.
 *   - text overflows AND not enabled (e.g. non-current rows): truncates
 *     with an ellipsis at the END (start visible).
 *
 * In both overflow cases the container is forced to `text-left` so the start
 * of the title is what's actually visible — without that, parent
 * `text-center` would clip the title symmetrically and reveal only the
 * middle.
 */
export function MarqueeText({
  children,
  className,
  enabled = true,
}: MarqueeTextProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const innerRef = React.useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = React.useState(0)

  React.useLayoutEffect(() => {
    const container = containerRef.current
    const inner = innerRef.current
    if (!container || !inner) return

    const measure = () => {
      const diff = inner.scrollWidth - container.clientWidth
      // Tiny rounding errors shouldn't trigger animation/truncation.
      setOverflow(diff > 4 ? diff : 0)
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [children])

  const hasOverflow = overflow > 0
  const animate = enabled && hasOverflow

  return (
    <div
      ref={containerRef}
      className={cn(
        "overflow-hidden whitespace-nowrap",
        className,
        // Forced AFTER `className` so it overrides caller `text-center` when
        // we actually need to clip — but only when there's overflow.
        hasOverflow && "text-left"
      )}
    >
      {hasOverflow ? (
        <span
          ref={innerRef}
          className={cn(
            animate
              ? "inline-block animate-marquee"
              : "block max-w-full truncate"
          )}
          // Inline style is the only way to surface a per-instance distance
          // to the keyframe; everything else stays in Tailwind utilities.
          style={
            animate
              ? ({ "--marquee-distance": `-${overflow}px` } as React.CSSProperties)
              : undefined
          }
        >
          {children}
        </span>
      ) : (
        <span ref={innerRef} className="inline-block">
          {children}
        </span>
      )}
    </div>
  )
}
