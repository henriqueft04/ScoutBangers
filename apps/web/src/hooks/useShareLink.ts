import * as React from "react"

import { shareUrl } from "@/lib/share"

const COPIED_FLASH_MS = 2000

/**
 * Wraps `shareUrl` with a short-lived `copied` flag, so every share button
 * can swap its icon for a check when the link landed on the clipboard
 * (desktop, or any browser without the native share sheet).
 */
export function useShareLink() {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  React.useEffect(() => () => clearTimeout(timer.current), [])

  const share = React.useCallback(async (title: string, url: string) => {
    const outcome = await shareUrl(title, url)
    if (outcome === "copied") {
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), COPIED_FLASH_MS)
    }
    return outcome
  }, [])

  return { copied, share }
}
