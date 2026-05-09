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
