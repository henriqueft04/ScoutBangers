import * as React from "react"

interface UseInViewOptions {
  /** Stop observing after the first intersection. Default: true. */
  once?: boolean
  /** Pre-load distance: fires the callback before the element is fully on
   *  screen so async work can start ahead of time. Default: "200px". */
  rootMargin?: string
}

/**
 * Returns `[ref, inView]`. Attach `ref` to the element you want to track;
 * `inView` flips to `true` when the element enters (or is near) the viewport.
 * Used to defer expensive work (network requests, decoding) until rows scroll
 * into view.
 */
export function useInView<T extends Element>({
  once = true,
  rootMargin = "200px",
}: UseInViewOptions = {}): [React.RefObject<T | null>, boolean] {
  const ref = React.useRef<T | null>(null)
  // Default to visible when IntersectionObserver is unavailable (SSR, very
  // old browsers) so dependent fetches still happen.
  const [inView, setInView] = React.useState(
    () => typeof IntersectionObserver === "undefined"
  )

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true)
            if (once) observer.disconnect()
          } else if (!once) {
            setInView(false)
          }
        }
      },
      { rootMargin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [once, rootMargin])

  return [ref, inView]
}
