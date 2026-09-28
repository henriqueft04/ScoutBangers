import * as React from "react"

const MIN_HEIGHT_PX = 200

/**
 * Live height (px) from `ref`'s top edge down to the app's sticky bottom
 * bar (PlayerBar + BottomNav, marked with data-app-bottom-bar in
 * AppShell). A plain `calc(100svh - <guess>)` breaks here because that
 * bar's height is conditional — the player bar only renders while a song
 * is loaded — so the "guess" is wrong half the time. Measuring the real
 * DOM instead stays correct as that bar grows/shrinks.
 */
export function useFillToBottomBar(
  ref: React.RefObject<HTMLElement | null>
): number | null {
  const [height, setHeight] = React.useState<number | null>(null)

  React.useEffect(() => {
    const el = ref.current
    const bottomBar = document.querySelector<HTMLElement>(
      "[data-app-bottom-bar]"
    )
    if (!el) return

    const recompute = () => {
      const elTop = el.getBoundingClientRect().top
      // Measuring the gap to the bottom bar's own top edge (rather than
      // deriving it from window.innerHeight - barHeight) automatically
      // accounts for whatever sits between them in the layout — e.g.
      // <main>'s bottom padding in AppShell — without hardcoding it here.
      const bottomBarTop = bottomBar
        ? bottomBar.getBoundingClientRect().top
        : window.innerHeight
      setHeight(Math.max(MIN_HEIGHT_PX, bottomBarTop - elTop))
    }

    recompute()
    window.addEventListener("resize", recompute)

    const observer = new ResizeObserver(recompute)
    if (bottomBar) observer.observe(bottomBar)

    return () => {
      window.removeEventListener("resize", recompute)
      observer.disconnect()
    }
  }, [ref])

  return height
}
