import { motion } from "framer-motion"

import { cn } from "@workspace/ui/lib/utils"

import { Cover, EASE } from "./primitives"
import { COVER_DELAY, type TransitionKind } from "./transitions"

/*
 * Motion between and behind the slides — the loud part of Wrapped.
 *
 * Transitions: each slide picks how it arrives. Some reveal the slide itself
 * (iris, wipe, zoom, flip); others play an effect on top of the outgoing
 * slide first — shutters, bubbles, a giant word — and the slide fades in
 * underneath once the screen is covered.
 *
 * Decorations: looping graphics drawn behind a slide's content (type bands,
 * floating shapes, sunbursts…). They go in a slide's `isolate` frame with
 * `-z-10`, so they never cover text.
 */

/**
 * The on-top part of a transition. Rendered over the outgoing slide; it
 * covers the screen in the new slide's colours, then fades away once the new
 * slide is in place under it.
 */
export function TransitionFX({
  kind,
  bg,
  fg,
  accent,
  word,
}: {
  kind: TransitionKind
  bg: string
  fg: string
  accent: string
  word?: string
}) {
  const hold = COVER_DELAY[kind]
  if (hold === undefined) return null
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[5] overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: hold + 0.3, duration: 0.35 }}
    >
      {kind === "blinds" || kind === "slash" ? (
        <div
          className={cn(
            "absolute flex",
            kind === "slash" ? "-inset-[30%] -rotate-[18deg]" : "inset-0"
          )}
        >
          {Array.from({ length: 7 }, (_, i) => (
            <motion.div
              key={i}
              className="h-full flex-1"
              style={{
                backgroundColor: i % 3 === 1 ? accent : bg,
                originY: i % 2 ? 0 : 1,
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1.02 }}
              transition={{ duration: 0.42, delay: i * 0.045, ease: [0.7, 0, 0.3, 1] }}
            />
          ))}
        </div>
      ) : null}

      {kind === "bubbles"
        ? BUBBLES.map((b, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${b.x}%`,
                top: `${b.y}%`,
                width: "90%",
                aspectRatio: "1",
                translateX: "-50%",
                translateY: "-50%",
                backgroundColor: [bg, accent, fg, bg][i % 4],
              }}
              initial={{ scale: 0 }}
              animate={{ scale: b.s }}
              transition={{ duration: 0.55, delay: i * 0.05, ease: EASE }}
            />
          ))
        : null}

      {kind === "burst" ? (
        <>
          <motion.div
            className="absolute inset-0"
            style={{ backgroundColor: bg }}
            initial={{ clipPath: "circle(0% at 50% 50%)" }}
            animate={{ clipPath: "circle(150% at 50% 50%)" }}
            transition={{ duration: 0.5, ease: EASE }}
          />
          <motion.div
            className="absolute inset-0 flex items-center justify-center text-[30vmin] leading-none font-black tracking-[-0.06em] whitespace-nowrap"
            style={{ color: fg }}
            initial={{ scale: 0.1, rotate: -20 }}
            animate={{ scale: [0.1, 1, 6], rotate: [-20, 0, 8] }}
            transition={{ duration: 1.05, times: [0, 0.45, 1], ease: "easeIn" }}
          >
            {word}
          </motion.div>
        </>
      ) : null}
    </motion.div>
  )
}

const BUBBLES = [
  { x: 85, y: 20, s: 1.6 },
  { x: 15, y: 75, s: 1.7 },
  { x: 60, y: 55, s: 1.5 },
  { x: 25, y: 15, s: 1.4 },
  { x: 80, y: 90, s: 1.6 },
  { x: 45, y: 40, s: 2.6 },
]

// ===== decorations ======================================================

const deco = "pointer-events-none absolute -z-10"

/** A band of repeated words scrolling forever — type as form. */
export function TypeBand({
  text,
  color,
  bg,
  top,
  rotate = -8,
  speed = 14,
  reverse = false,
  outline = false,
  className,
}: {
  text: string
  color: string
  bg?: string
  top: string
  rotate?: number
  speed?: number
  reverse?: boolean
  outline?: boolean
  className?: string
}) {
  const run = Array.from({ length: 8 }, () => text).join(" · ")
  return (
    <div
      aria-hidden
      className={cn(deco, "-inset-x-1/4 overflow-hidden py-[1.5cqw]", className)}
      style={{ top, rotate: `${rotate}deg`, backgroundColor: bg }}
    >
      <motion.div
        className="flex w-max text-[11cqw] leading-none font-black tracking-tight whitespace-nowrap"
        style={
          outline
            ? { color: "transparent", WebkitTextStroke: `2px ${color}` }
            : { color }
        }
        animate={{ x: reverse ? ["-50%", "0%"] : ["0%", "-50%"] }}
        transition={{ duration: speed, repeat: Infinity, ease: "linear" }}
      >
        <span className="pr-[4cqw]">{run}</span>
        <span className="pr-[4cqw]">{run}</span>
      </motion.div>
    </div>
  )
}

type ShapeName = "star" | "circle" | "ring" | "squiggle" | "plus" | "blob" | "triangle"

function ShapeSvg({ name, color }: { name: ShapeName; color: string }) {
  switch (name) {
    case "star":
      return (
        <svg viewBox="0 0 100 100" className="size-full">
          <path
            d="M50 0 L61 36 L100 38 L69 60 L80 98 L50 75 L20 98 L31 60 L0 38 L39 36 Z"
            fill={color}
          />
        </svg>
      )
    case "circle":
      return (
        <svg viewBox="0 0 100 100" className="size-full">
          <circle cx="50" cy="50" r="50" fill={color} />
        </svg>
      )
    case "ring":
      return (
        <svg viewBox="0 0 100 100" className="size-full">
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="14" />
        </svg>
      )
    case "plus":
      return (
        <svg viewBox="0 0 100 100" className="size-full">
          <path d="M38 0h24v38h38v24H62v38H38V62H0V38h38z" fill={color} />
        </svg>
      )
    case "triangle":
      return (
        <svg viewBox="0 0 100 100" className="size-full">
          <path d="M50 4 L96 92 L4 92 Z" fill={color} />
        </svg>
      )
    case "squiggle":
      return (
        <svg viewBox="0 0 120 40" className="size-full">
          <path
            d="M4 20 Q19 2 34 20 T64 20 T94 20 T124 20"
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
          />
        </svg>
      )
    case "blob":
      return (
        <svg viewBox="0 0 100 100" className="size-full">
          <path
            d="M71 9c13 8 24 24 23 41s-12 33-27 41-34 9-47-1S0 61 2 45 14 13 29 6s29-5 42 3z"
            fill={color}
          />
        </svg>
      )
  }
}

export interface FloatShape {
  name: ShapeName
  /** Position in % of the slide, size in cqw. */
  x: number
  y: number
  size: number
  color: string
  /** Seconds per full spin; 0 = no spin. */
  spin?: number
  delay?: number
}

/** Shapes that pop in and then drift and spin — the sticker layer. */
export function FloatingShapes({ shapes }: { shapes: FloatShape[] }) {
  return (
    <div aria-hidden className={cn(deco, "inset-0")}>
      {shapes.map((s, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}cqw`, height: `${s.size}cqw` }}
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.3 + (s.delay ?? i * 0.08) }}
        >
          <motion.div
            className="size-full"
            animate={{
              y: [0, -10, 0, 8, 0],
              rotate: s.spin ? [0, 360] : [0, 6, 0, -6, 0],
            }}
            transition={{
              y: { duration: 5 + (i % 3), repeat: Infinity, ease: "easeInOut" },
              rotate: s.spin
                ? { duration: s.spin, repeat: Infinity, ease: "linear" }
                : { duration: 6 + (i % 4), repeat: Infinity, ease: "easeInOut" },
            }}
          >
            <ShapeSvg name={s.name} color={s.color} />
          </motion.div>
        </motion.div>
      ))}
    </div>
  )
}

/** Slowly turning rays from a point, like a sun or a stage light. */
export function Sunburst({
  color,
  x = 50,
  y = 50,
  opacity = 0.18,
  delay = 0,
}: {
  color: string
  x?: number
  y?: number
  opacity?: number
  /** Seconds before the rays open. */
  delay?: number
}) {
  return (
    <div aria-hidden className={cn(deco, "inset-0 overflow-hidden")}>
      <motion.div
        className="absolute aspect-square w-[260%]"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          translateX: "-50%",
          translateY: "-50%",
          opacity,
          background: `repeating-conic-gradient(${color} 0deg 9deg, transparent 9deg 22.5deg)`,
          maskImage: "radial-gradient(circle, black 15%, transparent 60%)",
        }}
        initial={{ scale: 0 }}
        animate={{ scale: 1, rotate: 360 }}
        transition={{
          scale: { duration: 1, ease: EASE, delay },
          rotate: { duration: 60, repeat: Infinity, ease: "linear" },
        }}
      />
    </div>
  )
}

/** Big drifting blurred colour blobs — the soft gradient layer. */
export function GradientBlobs({ colors }: { colors: string[] }) {
  return (
    <div aria-hidden className={cn(deco, "inset-0 overflow-hidden")}>
      {colors.map((c, i) => (
        <motion.div
          key={i}
          className="absolute size-[90cqw] rounded-full blur-[18cqw]"
          style={{ backgroundColor: c, left: `${[-20, 40, 10][i % 3]}%`, top: `${[-10, 30, 65][i % 3]}%` }}
          animate={{ x: [0, 40, -30, 0], y: [0, -30, 20, 0], scale: [1, 1.15, 0.9, 1] }}
          transition={{ duration: 12 + i * 3, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  )
}

/** Rings rippling out from a point, like sound from a speaker. */
export function SoundRings({ color, x = 50, y = 40 }: { color: string; x?: number; y?: number }) {
  return (
    <div aria-hidden className={cn(deco, "inset-0 overflow-hidden")}>
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className="absolute aspect-square w-[40cqw] rounded-full border-[1.2cqw]"
          style={{ left: `${x}%`, top: `${y}%`, translateX: "-50%", translateY: "-50%", borderColor: color }}
          animate={{ scale: [0.6, 3.4], opacity: [0.5, 0] }}
          transition={{ duration: 4, delay: i, repeat: Infinity, ease: "easeOut" }}
        />
      ))}
    </div>
  )
}

/** Equalizer bars dancing along an edge. */
export function Equalizer({ color, bars = 18 }: { color: string; bars?: number }) {
  return (
    <div aria-hidden className={cn(deco, "inset-x-0 bottom-0 flex h-[13%] items-end gap-[1cqw] px-[1cqw] opacity-20")}>
      {Array.from({ length: bars }, (_, i) => (
        <motion.div
          key={i}
          className="flex-1 origin-bottom rounded-t-full"
          style={{ backgroundColor: color, height: "100%" }}
          animate={{ scaleY: [0.15, 0.4 + ((i * 37) % 60) / 100, 0.25, 0.9 - ((i * 13) % 40) / 100, 0.15] }}
          transition={{ duration: 1.6 + (i % 5) * 0.2, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  )
}

/** A compass rose, turning slowly. */
export function CompassRose({ color }: { color: string }) {
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 200 200"
      className={cn(deco, "-right-[30%] -bottom-[12%] w-[115%] opacity-15")}
      initial={{ rotate: -120, scale: 0.6 }}
      animate={{ rotate: 240, scale: 1 }}
      transition={{ rotate: { duration: 50, ease: "linear", repeat: Infinity }, scale: { duration: 1.2, ease: EASE } }}
    >
      <circle cx="100" cy="100" r="92" fill="none" stroke={color} strokeWidth="3" />
      <circle cx="100" cy="100" r="70" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 6" />
      <path d="M100 6 L114 100 L100 194 L86 100 Z" fill={color} />
      <path d="M6 100 L100 86 L194 100 L100 114 Z" fill={color} opacity="0.6" />
      <path d="M34 34 L106 94 L166 166 L94 106 Z" fill={color} opacity="0.35" />
      <path d="M166 34 L106 106 L34 166 L94 94 Z" fill={color} opacity="0.35" />
    </motion.svg>
  )
}

/** Covers scattered around like photos on a table, drifting. */
export function CoverCloud({
  songs,
  opacity = 0.9,
}: {
  songs: { id: string; modifiedTime?: string }[]
  opacity?: number
}) {
  return (
    <div aria-hidden className={cn(deco, "inset-0")} style={{ opacity }}>
      {songs.slice(0, CLOUD.length).map((s, i) => {
        const p = CLOUD[i]!
        return (
          <motion.div
            key={s.id}
            className="absolute shadow-2xl"
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.size}cqw` }}
            initial={{ scale: 0, rotate: p.r * 3 }}
            animate={{ scale: 1, rotate: p.r, y: [0, -8, 0] }}
            transition={{
              scale: { type: "spring", stiffness: 200, damping: 16, delay: 0.2 + i * 0.1 },
              rotate: { type: "spring", stiffness: 200, damping: 16, delay: 0.2 + i * 0.1 },
              y: { duration: 4 + i, repeat: Infinity, ease: "easeInOut" },
            }}
          >
            <Cover songId={s.id} modifiedTime={s.modifiedTime} className="aspect-square w-full rounded-[2cqw]" />
          </motion.div>
        )
      })}
    </div>
  )
}

const CLOUD = [
  { x: 58, y: 6, size: 34, r: 8 },
  { x: -6, y: 18, size: 28, r: -10 },
  { x: 70, y: 38, size: 26, r: -6 },
  { x: 4, y: 50, size: 22, r: 12 },
  { x: 40, y: 26, size: 20, r: 3 },
]

/** Confetti falling once, then settling — for wins. */
export function Confetti({ colors }: { colors: string[] }) {
  return (
    <div aria-hidden className={cn(deco, "inset-0 overflow-hidden")}>
      {Array.from({ length: 28 }, (_, i) => {
        const x = (i * 37) % 100
        return (
          <motion.div
            key={i}
            className={i % 3 ? "absolute h-[3cqw] w-[1.6cqw]" : "absolute size-[2.2cqw] rounded-full"}
            style={{ left: `${x}%`, top: "-5%", backgroundColor: colors[i % colors.length] }}
            initial={{ y: 0, rotate: 0 }}
            animate={{ y: ["0vh", "110vh"], rotate: [0, 360 + i * 40], x: [0, (i % 2 ? 1 : -1) * 30] }}
            transition={{ duration: 3 + (i % 5) * 0.4, delay: 0.3 + (i % 7) * 0.15, repeat: Infinity, ease: "linear" }}
          />
        )
      })}
    </div>
  )
}

/** A giant number or word drawn as an outline behind everything. */
export function GhostType({
  text,
  color,
  className,
}: {
  text: string
  color: string
  className?: string
}) {
  return (
    <motion.div
      aria-hidden
      className={cn(deco, "leading-[0.8] font-black tracking-[-0.06em] whitespace-nowrap", className)}
      style={{ color: "transparent", WebkitTextStroke: `2px ${color}`, opacity: 0.35 }}
      initial={{ x: "20%", opacity: 0 }}
      animate={{ x: "0%", opacity: 0.35 }}
      transition={{ duration: 1.4, ease: EASE }}
    >
      {text}
    </motion.div>
  )
}

