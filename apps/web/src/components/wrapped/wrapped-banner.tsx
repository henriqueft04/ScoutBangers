import { MotionConfig, motion } from "framer-motion"
import { Link } from "react-router-dom"

import { cn } from "@workspace/ui/lib/utils"

import { useAuth } from "@/hooks/useAuth"
import { isWrappedSeason, PALETTE, wrappedYear } from "@/lib/wrapped"

import { primeWrappedAudio } from "./use-wrapped-audio"

/**
 * "O teu Wrapped chegou" entry card. Shown in season to signed-in users on
 * the home page and the profile.
 */
export function WrappedBanner({ className }: { className?: string }) {
  const { user } = useAuth()
  if (!user || !isWrappedSeason()) return null
  const year = wrappedYear()
  const digits = String(year).split("")
  return (
    <MotionConfig reducedMotion="user">
    <Link
      to="/wrapped"
      // This tap is what lets the music start on the story's first card.
      onClick={primeWrappedAudio}
      className={cn(
        "group relative block overflow-hidden rounded-2xl p-5 outline-offset-2 transition-transform active:scale-[0.98]",
        className
      )}
      style={{ backgroundColor: PALETTE.maroon, color: PALETTE.cream }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-2 rounded-xl border-2 border-dashed opacity-60"
        style={{ borderColor: PALETTE.scarf }}
      />
      <div
        aria-hidden
        className="absolute -top-3 -right-1 flex text-[5.5rem] leading-none font-black tracking-[-0.08em]"
      >
        {digits.map((d, i) => (
          <motion.span
            key={i}
            style={{ color: i % 2 ? PALETTE.scarf : PALETTE.sky }}
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2.4, delay: i * 0.18, repeat: Infinity, ease: "easeInOut" }}
          >
            {d}
          </motion.span>
        ))}
      </div>
      <div className="relative flex flex-col gap-1 pt-12">
        <span className="text-xl font-black tracking-tight">O teu Wrapped {year} chegou</span>
        <span className="text-sm opacity-85">
          As tuas músicas, artistas e minutos do ano. Toca para ver.
        </span>
      </div>
    </Link>
    </MotionConfig>
  )
}
