import * as React from "react"
import { motion, useDragControls, type PanInfo } from "framer-motion"

import { cn } from "@workspace/ui/lib/utils"

interface BottomSheetProps {
  /** Render only when true; the parent owns mount lifecycle. */
  open: boolean
  onClose: () => void
  /** Accessible label for the dialog. */
  ariaLabel: string
  children: React.ReactNode
  className?: string
}

/**
 * Mobile-friendly bottom sheet:
 *
 *   - Tap the dim backdrop to close.
 *   - On mobile, drag the top "pill" handle downward to dismiss
 *     (drag is gated to the handle so the inner list still scrolls
 *     normally). Releasing past 100 px or with downward velocity
 *     above 500 px/s triggers close.
 *   - On desktop the pill is hidden — close via the X inside the
 *     panel or by clicking outside.
 *
 * Used by the queue and lyrics panels of the fullscreen player.
 * Animated open/close via framer-motion's spring + slide.
 *
 * The actual conditional `{open ? <BottomSheet /> : null}` rendering
 * lives in the parent so AnimatePresence can stagger exits across
 * mutually-exclusive sheets without each child needing to know.
 */
export function BottomSheet({
  open,
  onClose,
  ariaLabel,
  children,
  className,
}: BottomSheetProps) {
  const dragControls = useDragControls()

  if (!open) return null

  // Dismiss only when the user has dragged the sheet a substantial
  // distance — about 40 % of the viewport height. A quick swipe with
  // a small offset is treated as "didn't really mean it" and the
  // sheet snaps back. Velocity is intentionally NOT a trigger so a
  // careless flick doesn't close it; the user has to commit to the
  // gesture.
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const threshold =
      typeof window !== "undefined" ? window.innerHeight * 0.4 : 300
    if (info.offset.y > threshold) onClose()
  }

  return (
    <motion.div
      key="sheet-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="absolute inset-0 z-10 flex items-end justify-center md:items-center md:p-6"
      onClick={onClose}
    >
      <div className="bg-background/60 absolute inset-0 backdrop-blur-sm" />
      <motion.div
        key="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        // Top-only constraint with no elastic: the sheet refuses to be
        // dragged up past its rest position, but follows the finger
        // freely on the way down so the user can see how far they've
        // pulled. Drop is animated back to 0 by the spring transition.
        dragConstraints={{ top: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 35 }}
        className={cn(
          "bg-card text-card-foreground border-border relative flex h-[78%] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border shadow-2xl md:h-[80vh] md:rounded-2xl",
          className
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Drag handle — the pill. Only this region initiates drag,
            so taps and scrolls inside the body are unaffected.
            Hidden on desktop where the sheet is centered, not
            edge-anchored. */}
        <div
          className="flex cursor-grab justify-center pt-2 active:cursor-grabbing md:hidden"
          onPointerDown={(event) => dragControls.start(event)}
          style={{ touchAction: "none" }}
        >
          <span
            aria-hidden
            className="bg-muted-foreground/30 h-1 w-10 rounded-full"
          />
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}
