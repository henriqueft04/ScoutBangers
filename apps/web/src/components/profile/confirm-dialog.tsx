import * as React from "react"
import { createPortal } from "react-dom"

import { Button } from "@workspace/ui/components/button"

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Generic confirm dialog. Lighter-weight than a full sign-in-style
 * modal — used for one-off "are you sure?" prompts (cellular download
 * warning, evict-all confirmation, etc.).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  React.useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="bg-background/80 fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-sm md:items-center md:p-4"
      onClick={onCancel}
    >
      <div
        className="bg-card text-card-foreground border-border animate-in slide-in-from-bottom md:slide-in-from-bottom-0 md:fade-in w-full max-w-sm rounded-t-2xl border p-6 shadow-xl duration-200 ease-out md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <h2 className="text-foreground text-base font-semibold tracking-tight">
          {title}
        </h2>
        {description ? (
          <div className="text-muted-foreground mt-2 text-sm leading-relaxed">
            {description}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
