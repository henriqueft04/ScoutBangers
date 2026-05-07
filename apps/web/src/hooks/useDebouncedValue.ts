import * as React from "react"

/**
 * Returns `value` after it has been stable for `delayMs` milliseconds. Used to
 * keep the search filter responsive without thrashing the filtered list on
 * every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = React.useState(value)

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])

  return debounced
}
