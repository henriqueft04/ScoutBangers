import * as React from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

interface BottomSheetProps {
  open: boolean
  /** Accessible name of the dialog; also its visible heading. */
  title: string
  onClose: () => void
  /** Extra classes for the panel (e.g. a max height for scrolling lists). */
  className?: string
  children: React.ReactNode
}

/**
 * Modal that slides up from the bottom on phones and centers on desktop.
 * Closes on Escape or a tap outside the panel. Renders nothing while closed.
 */
export function BottomSheet({
  open,
  title,
  onClose,
  className,
  children,
}: BottomSheetProps) {
  React.useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="bg-background/80 fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-sm md:items-center md:p-4"
      onClick={(event) => {
        // React bubbles portal events to the component that opened the
        // sheet: without this, closing one opened from a song row also
        // "clicks" the row and starts the song.
        event.stopPropagation()
        onClose()
      }}
    >
      <div
        className={cn(
          "bg-card text-card-foreground border-border animate-in slide-in-from-bottom md:fade-in w-full max-w-md rounded-t-2xl border p-5 shadow-xl duration-200 ease-out md:rounded-2xl",
          className
        )}
        onClick={(event) => event.stopPropagation()}
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
