import { Loader2 } from "lucide-react"
import { Link } from "react-router-dom"

import { cn } from "@workspace/ui/lib/utils"

export interface TopListItem {
  /** Stable key. */
  id: string
  /** Visible label (song title, artist name). */
  label: string
  /** Number rendered on the right. */
  count: number
  /** When set, the label is wrapped in a Link to this path. */
  href?: string
}

interface TopListProps {
  title: string
  /** `null` means loading; `[]` means loaded-but-empty. */
  items: TopListItem[] | null
  emptyMessage: string
  className?: string
}

/**
 * Numbered top-N list used on the profile pages (top songs, top
 * artists). Loading state shows a spinner; empty state shows a muted
 * caption; otherwise the items render as `<ol>`.
 */
export function TopList({ title, items, emptyMessage, className }: TopListProps) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <h3 className="text-muted-foreground text-xs uppercase tracking-wider">
        {title}
      </h3>
      {items === null ? (
        <Loader2 className="text-muted-foreground size-4 animate-spin" />
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-baseline gap-3 text-sm">
              <span className="text-muted-foreground w-5 tabular-nums">
                {index + 1}
              </span>
              {item.href ? (
                <Link
                  to={item.href}
                  className="text-foreground flex-1 truncate hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-foreground flex-1 truncate">
                  {item.label}
                </span>
              )}
              <span className="text-muted-foreground text-xs tabular-nums">
                {item.count}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
