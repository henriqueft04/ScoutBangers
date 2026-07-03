/**
 * Share a URL using the platform's native share sheet when
 * available (mobile), falling back to writing it to the clipboard.
 * Resolves to one of:
 *  - "shared"    — user completed the native share sheet
 *  - "copied"    — clipboard write succeeded (no native share)
 *  - "cancelled" — user dismissed the native share sheet
 *  - "failed"    — neither path worked (no clipboard, etc.)
 */
export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed"

export async function shareUrl(
  title: string,
  url: string
): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url })
      return "shared"
    } catch {
      // User cancelled the share sheet, fall through to clipboard.
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url)
      return "copied"
    } catch {
      return "failed"
    }
  }
  return "failed"
}

/**
 * Whether the browser can share image files via the native share sheet
 * (Web Share API Level 2). This is the path that surfaces "Instagram → Story"
 * on iOS Safari / Android Chrome. Desktop browsers generally return false.
 */
export function canShareImage(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function")
    return false
  if (typeof navigator.canShare !== "function") return false
  try {
    const probe = new File([new Blob()], "probe.png", { type: "image/png" })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * Shares a pre-rendered story image via the native share sheet. Falls back to
 * triggering a download of the PNG when file sharing isn't available, so the
 * user can still post it manually.
 */
export async function shareImage(
  title: string,
  blob: Blob,
  filename = "story.png"
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: blob.type || "image/png" })

  if (canShareImage()) {
    try {
      await navigator.share({ title, files: [file] })
      return "shared"
    } catch (err) {
      // AbortError = user dismissed the sheet; anything else falls through.
      if (err instanceof DOMException && err.name === "AbortError")
        return "cancelled"
    }
  }

  // Fallback: download the image so it can be posted manually.
  try {
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
    return "copied"
  } catch {
    return "failed"
  }
}
