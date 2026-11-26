import { motion } from "framer-motion"
import { Heart } from "lucide-react"

import { PALETTE as C } from "@/lib/wrapped"
import { WRAPPED_THANKS } from "@/lib/wrapped-thanks"

import { EASE, Stitched } from "./primitives"
import { StoryButton } from "./slides"
import { useStory } from "./story-context"

/*
 * The grand finale: a thank-you from the author to everyone. All the noise
 * is the entrance; once it's over the slide is calm — plain background, the
 * title and the message — so the words get read.
 *
 *   0.0s  dark screen; a rocket climbs from the bottom
 *   0.9s  it bursts — white flash — a spinning colour wheel opens up
 *   1.3s  the title's letters fall from the sky one by one and bounce
 *   1.8s  a few fireworks go off, once each
 *   3.4s  the wheel fades back to plain; the card flips in with the message
 */

const SPARK_COLORS = [C.scarf, C.cream, C.ember, C.sky]
const BOOM = 0.9
const LETTERS_AT = 1.3
const CARD_AT = 3.4
/** Seconds between message lines appearing. */
const LINE_STEP = 0.4

export function ThanksSlide() {
  const { restart } = useStory()
  const letters = WRAPPED_THANKS.title.split("")
  return (
    <div className="@container isolate absolute inset-0 overflow-hidden">
      {/* Spinning colour wheel, revealed by the boom. */}
      <motion.div
        aria-hidden
        className="absolute top-1/2 left-1/2 -z-20 aspect-square w-[300%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background: `conic-gradient(${C.maroon}, ${C.ember}, ${C.scarf}, ${C.forest}, ${C.sky}, ${C.maroonDeep}, ${C.maroon})`,
        }}
        initial={{ scale: 0, rotate: 0 }}
        animate={{ scale: 1, rotate: 200 }}
        transition={{
          scale: { delay: BOOM, duration: 0.9, ease: EASE },
          rotate: { delay: BOOM, duration: CARD_AT, ease: "easeOut" },
        }}
      />
      {/* Dims the wheel while it spins, then covers it: plain from then on. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ backgroundColor: C.ink }}
        initial={{ opacity: 1 }}
        animate={{ opacity: [1, 0.4, 0.4, 1] }}
        transition={{
          delay: BOOM,
          duration: CARD_AT - BOOM + 0.8,
          times: [0, 0.2, 0.7, 1],
        }}
      />

      {/* The rocket and its boom. */}
      <motion.div
        aria-hidden
        className="absolute bottom-0 left-1/2 h-[14cqw] w-[1.6cqw] -translate-x-1/2 rounded-full"
        style={{ background: `linear-gradient(${C.cream}, transparent)` }}
        initial={{ y: "10%", opacity: 1 }}
        animate={{ y: "-330%", opacity: [1, 1, 0] }}
        transition={{ duration: BOOM, ease: "easeIn", times: [0, 0.9, 1] }}
      />
      <Burst x={50} y={42} at={BOOM} size={70} count={22} once />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0] }}
        transition={{ delay: BOOM, duration: 0.5, times: [0, 0.15, 1] }}
      />

      {/* A few more fireworks, once each. */}
      {FIREWORKS.map((f, i) => (
        <Burst key={i} {...f} once />
      ))}

      <div className="absolute inset-0 flex flex-col items-center gap-[5cqw] px-5 pt-20 pb-24">
        {/* The title, falling letter by letter. */}
        <div
          aria-label={WRAPPED_THANKS.title}
          className="flex shrink-0 text-[17cqw] leading-none font-black tracking-[-0.04em] drop-shadow-[0_6px_0_rgba(0,0,0,0.35)]"
        >
          {letters.map((ch, i) => (
            <motion.span
              key={i}
              aria-hidden
              style={{ color: C.cream, display: "inline-block" }}
              initial={{ y: "-140vh", rotate: (i % 2 ? 1 : -1) * (40 + i * 12) }}
              animate={{ y: 0, rotate: 0 }}
              transition={{
                delay: LETTERS_AT + i * 0.11,
                type: "spring",
                stiffness: 320,
                damping: 13,
              }}
            >
              <motion.span
                style={{ display: "inline-block" }}
                animate={{ y: [0, -10, 0], rotate: [0, i % 2 ? 4 : -4, 0] }}
                transition={{
                  delay: LETTERS_AT + 1.2 + i * 0.06,
                  duration: 0.7,
                  ease: "easeInOut",
                }}
              >
                {ch}
              </motion.span>
            </motion.span>
          ))}
        </div>

        {/* The message, on a sewn-on card that flips in. It takes the
            height that's left and scrolls inside when the text is longer. */}
        <motion.div
          className="flex min-h-0 w-full flex-1 flex-col [perspective:1000px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: CARD_AT }}
        >
          <motion.div
            className="flex min-h-0 flex-col"
            initial={{ rotateX: -100 }}
            animate={{ rotateX: 0 }}
            transition={{ delay: CARD_AT, type: "spring", stiffness: 120, damping: 14 }}
            style={{ transformOrigin: "top" }}
          >
            <Stitched
              thread={C.maroon}
              fill={C.cream}
              radius={28}
              className="flex min-h-0 flex-col overflow-hidden text-left shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
            >
              <div
                // Reading, not navigating: touches here scroll the text
                // instead of changing slide or pausing the story.
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                className="flex min-h-0 touch-pan-y flex-col gap-3 overflow-y-auto overscroll-contain px-[7cqw] py-[7cqw] [scrollbar-width:thin]"
                style={{
                  scrollbarColor: `${C.maroon} transparent`,
                  maskImage:
                    "linear-gradient(to bottom, transparent 0, black 5cqw, black calc(100% - 9cqw), transparent 100%)",
                }}
              >
                {WRAPPED_THANKS.lines.map((line, i) => (
                  <motion.p
                    key={i}
                    className="text-[4.4cqw] leading-snug font-bold"
                    style={{ color: C.ink }}
                    initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ delay: CARD_AT + 0.6 + i * LINE_STEP, duration: 0.6 }}
                  >
                    {line}
                  </motion.p>
                ))}
                <motion.p
                  className="flex shrink-0 items-center gap-2 self-end pb-[3cqw] text-[5.5cqw] font-black"
                  style={{ color: C.maroon }}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: CARD_AT + 0.8 + WRAPPED_THANKS.lines.length * LINE_STEP,
                    type: "spring",
                    stiffness: 300,
                  }}
                >
                  <Heart className="size-[1em] fill-current" aria-hidden />
                  {WRAPPED_THANKS.signature}
                </motion.p>
              </div>
            </Stitched>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: CARD_AT + 1.5 + WRAPPED_THANKS.lines.length * LINE_STEP }}
        >
          <StoryButton
            onClick={restart}
            className="px-4 py-2 text-sm underline-offset-4 hover:underline"
          >
            Ver outra vez
          </StoryButton>
        </motion.div>
      </div>
    </div>
  )
}

const FIREWORKS = [
  { x: 22, y: 18, at: 1.8, size: 34, count: 14 },
  { x: 78, y: 26, at: 2.2, size: 40, count: 16 },
  { x: 30, y: 74, at: 2.6, size: 30, count: 12 },
  { x: 74, y: 80, at: 3.0, size: 36, count: 14 },
]

/** One firework: sparks flying out from a point, fading — repeating unless `once`. */
function Burst({
  x,
  y,
  at,
  size,
  count,
  once = false,
}: {
  x: number
  y: number
  at: number
  size: number
  count: number
  once?: boolean
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute -z-[5]" style={{ left: `${x}%`, top: `${y}%` }}>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2
        const d = size * (0.75 + ((i * 7) % 5) / 10)
        return (
          <motion.span
            key={i}
            className="absolute block size-[2.2cqw] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: SPARK_COLORS[i % SPARK_COLORS.length] }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
            animate={{
              x: `${Math.cos(a) * d}cqw`,
              y: `${Math.sin(a) * d}cqw`,
              opacity: [0, 1, 1, 0],
              scale: [1, 1.2, 0.4],
            }}
            transition={{
              delay: at,
              duration: 1.3,
              ease: "easeOut",
              times: [0, 0.1, 0.6, 1],
              repeat: once ? 0 : Infinity,
              repeatDelay: 2.2 + (i % 3) * 0.1,
            }}
          />
        )
      })}
    </div>
  )
}
