/**
 * Format an ISO timestamp as a short relative-time string ("2 min ago",
 * "1 h ago", "yesterday", "Mon"). Uses Intl.RelativeTimeFormat for
 * locale-aware output.
 */
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

const HOUR = 3600
const DAY = HOUR * 24

export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ""
  const diffSec = Math.round((then - now) / 1000)
  const abs = Math.abs(diffSec)

  if (abs < 60) return rtf.format(diffSec >= 0 ? 1 : -1, "second")
  if (abs < HOUR) return rtf.format(Math.round(diffSec / 60), "minute")
  if (abs < DAY) return rtf.format(Math.round(diffSec / HOUR), "hour")
  if (abs < DAY * 7) return rtf.format(Math.round(diffSec / DAY), "day")

  const date = new Date(then)
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
