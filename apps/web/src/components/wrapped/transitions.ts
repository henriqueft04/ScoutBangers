import type { TargetAndTransition, Transition } from "framer-motion"

import { EASE } from "./primitives"

/** How a slide arrives when the story moves forward. See fx.tsx. */
export type TransitionKind =
  | "iris"
  | "wipe"
  | "blinds"
  | "bubbles"
  | "burst"
  | "zoom"
  | "flip"
  | "slash"

/** Effects that cover the screen before the slide shows: when it may show. */
export const COVER_DELAY: Partial<Record<TransitionKind, number>> = {
  blinds: 0.5,
  slash: 0.5,
  bubbles: 0.55,
  burst: 0.75,
}

/** How the slide element itself enters, per transition. */
export function enterMotion(
  kind: TransitionKind,
  origin: { x: number; y: number }
): { initial: TargetAndTransition; animate: TargetAndTransition; transition: Transition } {
  const at = `${Math.round(origin.x * 100)}% ${Math.round(origin.y * 100)}%`
  switch (kind) {
    case "iris":
      return {
        initial: { clipPath: `circle(0% at ${at})` },
        animate: { clipPath: `circle(150% at ${at})` },
        transition: { duration: 0.9, ease: EASE },
      }
    case "wipe":
      return {
        initial: { clipPath: "polygon(-60% 0%, -60% 0%, -100% 100%, -100% 100%)" },
        animate: { clipPath: "polygon(-60% 0%, 160% 0%, 120% 100%, -100% 100%)" },
        transition: { duration: 0.85, ease: [0.65, 0, 0.35, 1] },
      }
    case "zoom":
      return {
        initial: { scale: 0.15, rotate: -35, borderRadius: "50%", opacity: 0.6 },
        animate: { scale: 1, rotate: 0, borderRadius: "0%", opacity: 1 },
        transition: { type: "spring", stiffness: 140, damping: 18 },
      }
    case "flip":
      return {
        initial: { rotateY: -100, opacity: 0.4, transformPerspective: 1200 },
        animate: { rotateY: 0, opacity: 1, transformPerspective: 1200 },
        transition: { duration: 0.8, ease: EASE },
      }
    default:
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.25, delay: COVER_DELAY[kind] ?? 0 },
      }
  }
}

/** Plain arrival, for going back (no show for a slide you've already seen). */
export const BACK_MOTION = {
  initial: { opacity: 0, x: -30 } as TargetAndTransition,
  animate: { opacity: 1, x: 0 } as TargetAndTransition,
  transition: { duration: 0.35 } as Transition,
}

