import * as React from "react"
import { ArrowUpDown, Check, ChevronDown } from "lucide-react"
import { Popover } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

import { usePlayer } from "@/hooks/usePlayer"
import { SORT_LABEL } from "@/lib/sort"
import type { SortMode } from "@/lib/types"

const SORT_OPTIONS: SortMode[] = ["default", "title", "artist"]

interface SortSelectProps {
  className?: string
}

/**
 * Sort picker. Built on Radix `Popover` so we get:
 *   - automatic collision avoidance (the menu re-positions to stay inside
 *     the viewport on narrow phones — no more clipped right edge)
 *   - data-state-driven animations matching the rest of the app's tw-animate
 *     vocabulary (slide + fade + zoom)
 *   - native focus management and Esc / outside-click handling
 *
 * The trigger keeps the same height/border/typography as the search input so
 * the row reads as one cohesive control group.
 */
export function SortSelect({ className }: SortSelectProps) {
  const { sort, setSort } = usePlayer()
  const [open, setOpen] = React.useState(false)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        className={cn(
          "border-input bg-background text-foreground inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm shadow-xs transition-colors md:h-9",
          "hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-3 focus-visible:outline-none",
          "data-[state=open]:bg-muted touch-manipulation",
          className
        )}
      >
        <ArrowUpDown
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
        <span className="font-medium whitespace-nowrap">
          {SORT_LABEL[sort]}
        </span>
        <ChevronDown
          aria-hidden
          className="text-muted-foreground size-3.5 shrink-0 transition-transform data-[state=open]:rotate-180"
          data-state={open ? "open" : "closed"}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "border-border bg-background text-foreground z-50 overflow-hidden rounded-md border p-1 shadow-lg",
            "min-w-[var(--radix-popover-trigger-width)] origin-(--radix-popover-content-transform-origin)",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1"
          )}
        >
          {SORT_OPTIONS.map((option) => {
            const selected = option === sort
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setSort(option)
                  setOpen(false)
                }}
                className={cn(
                  "hover:bg-accent flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                  "focus-visible:bg-accent focus-visible:outline-none",
                  selected && "text-primary font-medium"
                )}
              >
                <Check
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0 transition-opacity",
                    selected ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="whitespace-nowrap">{SORT_LABEL[option]}</span>
              </button>
            )
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
