import * as React from "react"
import { animate, motion, useMotionValue, useTransform } from "framer-motion"
import { Music } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import { formatNumber } from "@/lib/wrapped"

/** Spring-ish ease used across the story: fast out, long settle. */
export const EASE = [0.16, 1, 0.3, 1] as const

/** A number that rolls up from 0 to `value` once mounted. */
export function CountUp({
  value,
  delay = 0,
  duration = 1.8,
  className,
}: {
  value: number
  delay?: number
  duration?: number
  className?: string
}) {
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => formatNumber(v))
  React.useEffect(() => {
    const controls = animate(mv, value, { duration, delay, ease: EASE })
    return () => controls.stop()
  }, [mv, value, delay, duration])
  return (
    <motion.span className={cn("tabular-nums", className)}>{text}</motion.span>
  )
}

/**
 * Headline lines that slide up out of a mask, one after another. Pass each
 * line as a child; strings and elements both work.
 */
export function Reveal({
  children,
  delay = 0,
  stagger = 0.12,
  className,
  lineClassName,
}: {
  children: React.ReactNode
  delay?: number
  stagger?: number
  className?: string
  lineClassName?: string
}) {
  const lines = React.Children.toArray(children)
  return (
    <span className={cn("flex flex-col", className)}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <motion.span
            className={cn("block", lineClassName)}
            initial={{ y: "110%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.9, delay: delay + i * stagger, ease: EASE }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

/** Fades + lifts its children in after `delay` seconds. */
export function Appear({
  children,
  delay = 0,
  className,
  y = 16,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  y?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/** Song cover from the embedded tags, or the brand placeholder. */
export function Cover({
  songId,
  modifiedTime,
  size = "thumb",
  className,
}: {
  songId: string | undefined
  modifiedTime?: string
  size?: "thumb" | "full"
  className?: string
}) {
  const meta = useTrackMetadata(songId, Boolean(songId), modifiedTime)
  const url = size === "full" ? meta?.pictureUrl ?? meta?.thumbUrl : meta?.thumbUrl
  return url ? (
    <img src={url} alt="" className={cn("object-cover", className)} draggable={false} />
  ) : (
    <div
      aria-hidden
      className={cn("flex items-center justify-center bg-black/20", className)}
    >
      <Music className="size-1/3 opacity-60" />
    </div>
  )
}

/**
 * The embroidered-patch edge: a dashed "stitch" line inset from the border.
 * Used on the persona patch and the summary card.
 */
export function Stitched({
  children,
  className,
  thread,
  fill,
  radius = 28,
}: {
  children: React.ReactNode
  className?: string
  thread: string
  fill?: string
  radius?: number
}) {
  return (
    <div
      className={cn("relative", className)}
      style={{ borderRadius: radius, backgroundColor: fill }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-2.5"
        style={{
          borderRadius: radius - 8,
          border: `3px dashed ${thread}`,
          opacity: 0.85,
        }}
      />
      {children}
    </div>
  )
}

/** Very subtle film grain over the whole story, like the share cards. */
export function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.09] mix-blend-overlay"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }}
    />
  )
}
