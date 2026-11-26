import * as React from "react"
import { motion } from "framer-motion"
import { Medal } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { fetchArtistBanner } from "@/lib/artist-banners"
import {
  formatDay,
  formatNumber,
  MONTHS,
  MONTHS_SHORT,
  minutesInWords,
  monthName,
  PALETTE,
  WEEKDAYS,
  type Wrapped,
} from "@/lib/wrapped"

import {
  CompassRose,
  Confetti,
  CoverCloud,
  Equalizer,
  FloatingShapes,
  GhostType,
  SoundRings,
  Sunburst,
  TypeBand,
} from "./fx"
import { Appear, CountUp, Cover, EASE, Reveal, Stitched } from "./primitives"
import { useStory } from "./story-context"

/*
 * The slides of the Wrapped story. Each one is a full-bleed colour field
 * (colours come from the slide definition in build-slides.tsx) with
 * oversized type. Sizes use container units (cqw) so the story scales with
 * its frame, phone or desktop alike.
 */

const frame = "@container isolate absolute inset-0 flex flex-col px-7 pt-24 pb-24"

/** A button inside a slide: doesn't count as a tap on the story. */
export function StoryButton({
  className,
  style,
  onClick,
  children,
}: {
  className?: string
  style?: React.CSSProperties
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={onClick}
      style={style}
      className={cn(
        "rounded-full px-7 py-3.5 text-base font-bold transition-transform active:scale-95",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current",
        className
      )}
    >
      {children}
    </button>
  )
}

// ===== 1. intro =========================================================

export function IntroSlide({
  year,
  name,
  covers = [],
}: {
  year: number
  name: string
  /** Top songs, scattered behind the year. */
  covers?: { id: string; modifiedTime?: string }[]
}) {
  const { start, soundOn, toggleSound } = useStory()
  const digits = String(year).split("")
  return (
    <div className={cn(frame, "justify-between")}>
      <TypeBand text="WRAPPED" color={PALETTE.maroon} bg={PALETTE.scarf} top="27%" rotate={-9} speed={11} />
      <TypeBand text="WRAPPED" color={PALETTE.sky} top="52%" rotate={6} speed={14} reverse outline />
      {covers.length ? <CoverCloud songs={covers} opacity={0.35} /> : null}
      <div className="-mx-2 mt-4 grid grid-cols-2 leading-[0.78] font-black tracking-[-0.08em]">
        {digits.map((d, i) => (
          <motion.span
            key={i}
            className="text-[58cqw]"
            initial={{ opacity: 0, x: i % 2 ? 140 : -140, y: i < 2 ? -120 : 120, rotate: i % 2 ? 18 : -18 }}
            animate={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
            transition={{ duration: 1.1, delay: 0.15 + i * 0.12, ease: EASE }}
          >
            {d}
          </motion.span>
        ))}
      </div>
      <div className="flex flex-col gap-6">
        <Reveal delay={0.9} className="text-[9.5cqw] leading-[1.02] font-extrabold tracking-tight">
          <span>{name},</span>
          <span>este foi o teu ano</span>
          <span>no ScoutBangers.</span>
        </Reveal>
        <Appear delay={1.5} className="flex items-center gap-4">
          <StoryButton
            onClick={start}
            style={{ backgroundColor: PALETTE.cream, color: PALETTE.maroon }}
          >
            Começar
          </StoryButton>
          <StoryButton
            onClick={toggleSound}
            className="px-4 py-2 text-sm font-semibold underline-offset-4 hover:underline"
          >
            {soundOn ? "🔊 Som ligado" : "🎧 Ligar som"}
          </StoryButton>
        </Appear>
      </div>
    </div>
  )
}

export function NotEnoughSlide({ year }: { year: number }) {
  const { close } = useStory()
  return (
    <div className={cn(frame, "justify-end gap-6")}>
      <Reveal className="text-[11cqw] leading-[1] font-black tracking-tight">
        <span>Ainda não</span>
        <span>ouviste o</span>
        <span>suficiente.</span>
      </Reveal>
      <Appear delay={0.6}>
        <p className="max-w-[34ch] text-[clamp(14px,4.8cqw,18px)] leading-snug opacity-90">
          Ouve pelo menos 10 músicas e volta cá. O teu Wrapped {year} vai
          enchendo à medida que ouves, até ao fim de janeiro.
        </p>
      </Appear>
      <Appear delay={0.9}>
        <StoryButton
          onClick={close}
          style={{ backgroundColor: PALETTE.cream, color: PALETTE.maroon }}
        >
          Ir ouvir música
        </StoryButton>
      </Appear>
    </div>
  )
}

// ===== 2. minutes =======================================================

export function MinutesSlide({ data }: { data: Wrapped }) {
  return (
    <div className={cn(frame, "justify-center")}>
      <TypeBand text="MINUTOS" color={PALETTE.maroonDeep} top="14%" rotate={-6} speed={12} outline />
      <TypeBand text="A OUVIR A OUVIR" color={PALETTE.scarf} bg={PALETTE.maroonDeep} top="86%" rotate={5} speed={10} reverse />
      <FloatingShapes
        shapes={[
          { name: "star", x: 78, y: 22, size: 15, color: PALETTE.ember, spin: 12 },
          { name: "circle", x: 84, y: 40, size: 9, color: PALETTE.sky },
        ]}
      />
      <Reveal className="text-[8cqw] font-bold">
        <span>Este ano ouviste</span>
      </Reveal>
      <div className="-ml-1 text-[27cqw] leading-[0.9] font-black tracking-[-0.06em]">
        <CountUp value={data.minutes} delay={0.4} duration={2.2} />
      </div>
      <Reveal delay={0.5} className="text-[12cqw] leading-none font-black tracking-tight">
        <span>minutos.</span>
      </Reveal>
      <Appear delay={2.4} className="mt-10 flex flex-col gap-3 text-[clamp(15px,5.3cqw,20px)] leading-snug font-semibold">
        <p>Isso são {minutesInWords(data.minutes)} de música, sem parar.</p>
        {data.topPercent !== null ? (
          <p className="opacity-90">
            Estás no top {data.topPercent}% dos ouvintes do ScoutBangers.
          </p>
        ) : null}
      </Appear>
    </div>
  )
}

// ===== 3. the year in months ===========================================

export function YearSlide({ data }: { data: Wrapped }) {
  const byMonth = data.raw.by_month
  // Only the months since the first play: no wall of empty bars before the
  // app existed.
  const first = Math.max(0, byMonth.findIndex((c) => c > 0))
  const months = byMonth.slice(first)
  const max = Math.max(1, ...months)
  const peak = data.peakMonth ?? 0
  return (
    <div className={cn(frame, "justify-between")}>
      <GhostType text={String(data.year)} color={PALETTE.scarf} className="-right-[6%] top-[9%] text-[46cqw]" />
      <FloatingShapes
        shapes={[
          { name: "squiggle", x: 60, y: 24, size: 26, color: PALETTE.sky },
          { name: "star", x: 86, y: 70, size: 9, color: PALETTE.ember, spin: 12 },
        ]}
      />
      <Reveal className="text-[11cqw] leading-[1] font-black tracking-tight">
        <span>{monthName(peak)}</span>
        <span>foi o teu mês.</span>
      </Reveal>
      <div className="flex h-[42%] items-end gap-[1.5cqw]" aria-hidden>
        {months.map((c, i) => {
          const m = first + i
          const isPeak = m === peak
          return (
            <div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <motion.div
                className="w-full origin-bottom rounded-t-[1.5cqw]"
                style={{
                  height: `${Math.max(3, (c / max) * 100)}%`,
                  backgroundColor: "currentColor",
                  opacity: isPeak ? 1 : 0.35,
                }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.9, delay: 0.5 + i * 0.07, ease: EASE }}
              />
              <span className={cn("text-xs font-bold", !isPeak && "opacity-60")}>
                {MONTHS_SHORT[m]}
              </span>
            </div>
          )
        })}
      </div>
      <Appear delay={1.4} className="flex flex-col gap-2 text-[clamp(15px,5.3cqw,20px)] leading-snug font-semibold">
        <p>
          Em {MONTHS[peak]} tocaste {formatNumber(byMonth[peak] ?? 0)} músicas.
        </p>
        <p className="opacity-85">
          Ouviste música em {formatNumber(data.raw.active_days)}{" "}
          {data.raw.active_days === 1 ? "dia" : "dias"} diferentes.
        </p>
      </Appear>
    </div>
  )
}

// ===== 4. biggest day + streak =========================================

export function DaySlide({ data }: { data: Wrapped }) {
  const day = data.raw.biggest_day!
  const date = new Date(`${day.date}T12:00:00`)
  const streak = data.raw.longest_streak
  return (
    <div className={cn(frame, "justify-between")}>
      <Sunburst color={PALETTE.pine} x={50} y={50} opacity={0.12} />
      <FloatingShapes
        shapes={[
          { name: "star", x: 6, y: 34, size: 11, color: PALETTE.maroon, spin: 14 },
          { name: "squiggle", x: 66, y: 30, size: 22, color: PALETTE.cream },
          { name: "circle", x: 82, y: 60, size: 8, color: PALETTE.scarf },
        ]}
      />
      <Reveal className="text-[8cqw] leading-tight font-bold">
        <span>O teu dia mais</span>
        <span>barulhento foi…</span>
      </Reveal>
      <div className="flex justify-center [perspective:900px]">
        <motion.div
          className="flex w-[min(62cqw,34cqh)] flex-col overflow-hidden rounded-[5cqw] shadow-2xl"
          style={{ backgroundColor: PALETTE.cream, color: PALETTE.pine, transformOrigin: "top" }}
          initial={{ rotateX: -95, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          transition={{ duration: 1.1, delay: 0.7, ease: EASE }}
        >
          <div className="py-2 text-center text-[clamp(14px,4.8cqw,18px)] font-bold" style={{ backgroundColor: PALETTE.maroon, color: PALETTE.cream }}>
            {MONTHS[date.getMonth()]}
          </div>
          <div className="py-2 text-center text-[min(34cqw,19cqh)] leading-none font-black tracking-tighter">
            {date.getDate()}
          </div>
          <div className="pb-4 text-center text-base font-semibold opacity-75">
            {WEEKDAYS[(date.getDay() + 6) % 7]}
          </div>
        </motion.div>
      </div>
      <Appear delay={1.7} className="flex flex-col gap-3 text-[clamp(15px,5.3cqw,20px)] leading-snug font-semibold">
        <p>
          Nesse dia ouviste {formatNumber(day.plays)} músicas. Foi festa rija.
        </p>
        {streak && streak.days >= 3 ? (
          <p className="opacity-90">
            E a tua maior sequência foi de {streak.days} dias seguidos a ouvir,
            de {formatDay(new Date(`${streak.start}T12:00:00`))} a{" "}
            {formatDay(new Date(`${streak.end}T12:00:00`))}.
          </p>
        ) : null}
      </Appear>
    </div>
  )
}

// ===== 5. listening persona (the patch) ================================

function HourClock({ byHour, peak }: { byHour: number[]; peak: number }) {
  const max = Math.max(1, ...byHour)
  const size = 200
  const c = size / 2
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-[min(64cqw,30cqh)]" aria-hidden>
      <circle cx={c} cy={c} r={24} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2} />
      {byHour.map((v, h) => {
        const a = (h / 24) * Math.PI * 2 - Math.PI / 2
        const len = 28 + (v / max) * 66
        return (
          <motion.line
            key={h}
            x1={c + Math.cos(a) * 28}
            y1={c + Math.sin(a) * 28}
            x2={c + Math.cos(a) * len}
            y2={c + Math.sin(a) * len}
            strokeWidth={5}
            strokeLinecap="round"
            stroke={h === peak ? PALETTE.ember : "currentColor"}
            strokeOpacity={h === peak ? 1 : 0.7}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, delay: 0.3 + h * 0.035, ease: EASE }}
          />
        )
      })}
      {[0, 6, 12, 18].map((h) => {
        const a = (h / 24) * Math.PI * 2 - Math.PI / 2
        return (
          <text
            key={h}
            x={c + Math.cos(a) * 14}
            y={c + Math.sin(a) * 14 + 3}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fill="currentColor"
            opacity={0.7}
          >
            {h}
          </text>
        )
      })}
    </svg>
  )
}

/** Seconds the hour clock has the slide to itself before the badge lands. */
const PATCH_AT = 6

export function PersonaSlide({ data }: { data: Wrapped }) {
  const p = data.persona
  return (
    <div className={cn(frame, "justify-between")}>
      <Sunburst color={data.persona.field} x={50} y={52} opacity={0.35} delay={PATCH_AT} />
      <Reveal className="text-[8cqw] leading-tight font-bold">
        <span>As horas a que ouves</span>
        <span>dizem muito de ti.</span>
      </Reveal>
      <div className="relative flex flex-1 items-center justify-center">
        {/* The clock gets the stage on its own first; then fades back. */}
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 0.22, scale: 0.92 }}
          transition={{ delay: PATCH_AT, duration: 0.6 }}
        >
          <motion.div
            className="rounded-full bg-white p-[3cqw] shadow-[0_14px_40px_rgba(0,0,0,0.18)]"
            initial={{ scale: 0.4, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 160, damping: 16 }}
          >
            <HourClock byHour={data.raw.by_hour} peak={data.peakHour} />
          </motion.div>
          <Appear delay={1.2} className="text-center text-[clamp(14px,4.8cqw,18px)] font-bold">
            Ouves mais por volta das {data.peakHour}h.
          </Appear>
        </motion.div>
        {/* The patch gets "sewn on" over the clock. */}
        <motion.div
          className="absolute"
          initial={{ opacity: 0, scale: 2.4, rotate: -24 }}
          animate={{ opacity: 1, scale: 1, rotate: -5 }}
          transition={{ delay: PATCH_AT, type: "spring", stiffness: 260, damping: 18 }}
        >
          <Stitched
            thread={p.thread}
            fill={p.field}
            className="flex w-[72cqw] flex-col items-center gap-2 px-6 py-7 text-center shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
            radius={36}
          >
            <p.icon aria-hidden className="size-[16cqw]" strokeWidth={1.75} style={{ color: p.thread }} />
            <span
              className="text-[9cqw] leading-[1] font-black tracking-tight"
              style={{ color: p.thread }}
            >
              {p.name}
            </span>
          </Stitched>
        </motion.div>
      </div>
      <Appear
        delay={PATCH_AT + 0.8}
        className={cn(
          "flex flex-col gap-2 leading-snug font-semibold",
          // The long taglines need room on short phones.
          p.tagline.length > 140 ? "text-[clamp(13px,4.3cqw,16px)]" : "text-[clamp(14px,4.8cqw,18px)]"
        )}
      >
        <p>{p.tagline}</p>
        <p className="opacity-80">
          O teu dia preferido para ouvir é {data.favouriteWeekday >= 5 ? "o" : "a"}{" "}
          {WEEKDAYS[data.favouriteWeekday]}.
        </p>
      </Appear>
    </div>
  )
}

// ===== 6. top artist reveal ============================================

function useArtistBanner(name: string | undefined): string | null | undefined {
  const [url, setUrl] = React.useState<string | null | undefined>(undefined)
  React.useEffect(() => {
    if (!name) return
    let cancelled = false
    fetchArtistBanner(name)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setUrl(null))
    return () => {
      cancelled = true
    }
  }, [name])
  return url
}

/** "O teu … do ano é…" beat that fades away before the reveal. */
function Teaser({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center px-7"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 2.4, times: [0, 0.15, 0.8, 1] }}
    >
      <span className="text-[11cqw] leading-[1.02] font-black tracking-tight">{children}</span>
    </motion.div>
  )
}

const REVEAL_AT = 2.2

export function TopArtistSlide({ data }: { data: Wrapped }) {
  const artist = data.topArtists[0]!
  const banner = useArtistBanner(artist.name)
  const fan = data.raw.top_artist_fan_rank
  return (
    <div className="@container isolate absolute inset-0">
      <Sunburst color={PALETTE.scarf} x={50} y={30} opacity={0.12} />
      <Teaser>
        O teu artista
        <br />
        do ano é…
      </Teaser>
      <motion.div
        className="absolute inset-0 flex flex-col px-7 pt-24 pb-24"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: REVEAL_AT, duration: 0.4 }}
      >
        <motion.div
          className="-mx-7 aspect-[1200/742] overflow-hidden"
          initial={{ scale: 1.25, clipPath: "inset(50% 0 50% 0)" }}
          animate={{ scale: 1, clipPath: "inset(0% 0 0% 0)" }}
          transition={{ delay: REVEAL_AT, duration: 1.2, ease: EASE }}
        >
          {banner ? (
            <img src={banner} alt="" className="size-full object-cover" draggable={false} />
          ) : (
            <Cover songId={artist.soundtrackId} size="full" className="size-full" />
          )}
        </motion.div>
        <div className="flex flex-1 flex-col justify-end gap-4">
          <Reveal
            delay={REVEAL_AT + 0.4}
            className={cn(
              "leading-[0.95] font-black tracking-tight",
              // Long names get smaller instead of cut off.
              artist.name.length > 26 ? "text-[8.5cqw]" : artist.name.length > 14 ? "text-[11cqw]" : "text-[14cqw]"
            )}
          >
            <span className="line-clamp-3 break-words">{artist.name}</span>
          </Reveal>
          <Appear delay={REVEAL_AT + 1} className="flex flex-col gap-2 text-[clamp(15px,5.3cqw,20px)] leading-snug font-semibold">
            <p>
              {formatNumber(artist.plays)} reproduções, {formatNumber(artist.minutes)} minutos
              juntos.
            </p>
            {fan ? (
              <p className="opacity-85">
                {fan.rank === 1
                  ? `És o fã nº 1 de ${artist.name}. Ninguém ouviu mais.`
                  : `És o fã nº ${fan.rank} de ${formatNumber(fan.fans)} que o ouviram este ano.`}
              </p>
            ) : null}
          </Appear>
        </div>
      </motion.div>
    </div>
  )
}

// ===== 7 / 9. ranked lists =============================================

function RankedRow({
  rank,
  delay,
  children,
}: {
  rank: number
  delay: number
  children: React.ReactNode
}) {
  return (
    <motion.li
      className="flex items-center gap-4"
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      <span className="w-[9cqw] shrink-0 text-[9cqw] leading-none font-black tabular-nums">
        {rank}
      </span>
      {children}
    </motion.li>
  )
}

export function TopArtistsSlide({ data }: { data: Wrapped }) {
  return (
    <div className={cn(frame, "justify-center gap-10")}>
      <TypeBand text="ARTISTAS" color={PALETTE.ink} top="88%" rotate={3} speed={13} reverse outline />
      <FloatingShapes
        shapes={[
          { name: "ring", x: 80, y: 13, size: 14, color: PALETTE.cream },
          { name: "star", x: 86, y: 66, size: 10, color: PALETTE.scarf, spin: 10 },
        ]}
      />
      <Reveal className="text-[11cqw] leading-[1] font-black tracking-tight">
        <span>Os teus</span>
        <span>artistas do ano</span>
      </Reveal>
      <ol className="flex flex-col gap-5">
        {data.topArtists.map((a, i) => (
          <RankedRow key={a.name} rank={i + 1} delay={0.6 + i * 0.15}>
            <div className="flex min-w-0 flex-col">
              <span className={cn("truncate font-extrabold tracking-tight", i === 0 ? "text-[8cqw]" : "text-[6cqw]")}>
                {a.name}
              </span>
              <span className="text-sm font-semibold opacity-75">
                {formatNumber(a.plays)} reproduções
              </span>
            </div>
          </RankedRow>
        ))}
      </ol>
    </div>
  )
}

export function TopSongsSlide({ data }: { data: Wrapped }) {
  return (
    <div className={cn(frame, "justify-center gap-8")}>
      <TypeBand text="TOP 5" color={PALETTE.maroon} top="88%" rotate={-5} speed={9} outline />
      <FloatingShapes
        shapes={[
          { name: "blob", x: 78, y: 15, size: 16, color: PALETTE.ember },
          { name: "star", x: 88, y: 70, size: 8, color: PALETTE.maroon, spin: 12 },
        ]}
      />
      <Reveal className="text-[11cqw] leading-[1] font-black tracking-tight">
        <span>As tuas</span>
        <span>músicas do ano</span>
      </Reveal>
      <ol className="flex flex-col gap-4">
        {data.topSongs.map((s, i) => (
          <RankedRow key={s.song.id} rank={i + 1} delay={0.6 + i * 0.15}>
            <Cover
              songId={s.song.id}
              modifiedTime={s.song.modifiedTime}
              className="size-[15cqw] shrink-0 rounded-[2cqw]"
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[5.5cqw] font-extrabold tracking-tight">{s.title}</span>
              <span className="truncate text-sm font-semibold opacity-75">
                {s.artist ? `${s.artist}, ` : ""}
                {formatNumber(s.plays)}×
              </span>
            </div>
          </RankedRow>
        ))}
      </ol>
    </div>
  )
}

// ===== 8. top song reveal ==============================================

export function TopSongSlide({ data }: { data: Wrapped }) {
  const top = data.topSongs[0]!
  return (
    <div className="@container isolate absolute inset-0">
      <SoundRings color={PALETTE.scarf} x={50} y={32} />
      <Equalizer color={PALETTE.scarf} />
      <Teaser>
        A música que
        <br />
        mais ouviste…
      </Teaser>
      <motion.div
        className="absolute inset-0 flex flex-col px-7 pt-24 pb-24"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: REVEAL_AT, duration: 0.4 }}
      >
        {/* Sleeve + record sliding out of it. */}
        <div className="relative mx-auto mt-2 w-[min(62cqw,27cqh)]">
          <motion.div
            className="absolute inset-[4%] rounded-full"
            style={{
              background:
                "repeating-radial-gradient(circle, #111 0 2px, #1d1d1d 2px 4px)",
            }}
            initial={{ x: 0, rotate: 0 }}
            animate={{ x: "32%", rotate: 360 }}
            transition={{
              x: { delay: REVEAL_AT + 0.6, duration: 1, ease: EASE },
              rotate: { delay: REVEAL_AT + 0.6, duration: 6, repeat: Infinity, ease: "linear" },
            }}
          >
            <div className="absolute inset-[34%] overflow-hidden rounded-full">
              <Cover songId={top.song.id} modifiedTime={top.song.modifiedTime} className="size-full" />
            </div>
          </motion.div>
          <motion.div
            className="relative aspect-square overflow-hidden rounded-[3cqw] shadow-2xl"
            initial={{ scale: 0.6, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: REVEAL_AT, type: "spring", stiffness: 200, damping: 20 }}
          >
            <Cover
              songId={top.song.id}
              modifiedTime={top.song.modifiedTime}
              size="full"
              className="size-full"
            />
          </motion.div>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-3">
          <Reveal
            delay={REVEAL_AT + 0.5}
            className={cn(
              "leading-[0.98] font-black tracking-tight",
              top.title.length > 24 ? "text-[min(8cqw,4.6cqh)]" : "text-[min(11cqw,6.2cqh)]"
            )}
          >
            <span className="line-clamp-3 break-words">{top.title}</span>
          </Reveal>
          {top.artist ? (
            <Appear delay={REVEAL_AT + 0.8} className="text-[clamp(15px,5.3cqw,20px)] font-bold opacity-85">
              {top.artist}
            </Appear>
          ) : null}
          <Appear delay={REVEAL_AT + 1.3} className="flex flex-col gap-1.5 text-[clamp(14px,4.8cqw,18px)] leading-snug font-semibold">
            <p>
              Ouviste-a {formatNumber(top.plays)} vezes. A primeira foi a{" "}
              {formatDay(top.firstPlayedAt)}.
            </p>
            {top.bestDay && top.bestDayPlays >= 3 ? (
              <p className="opacity-85">
                Só no dia {formatDay(top.bestDay)} ouviste-a {top.bestDayPlays} vezes.
              </p>
            ) : null}
          </Appear>
        </div>
      </motion.div>
    </div>
  )
}

// ===== 10. discoveries ================================================

export function DiscoveriesSlide({ data }: { data: Wrapped }) {
  const share = data.catalogShare ?? 0
  const pct = Math.round(share * 100)
  const r = 42
  return (
    <div className={cn(frame, "justify-between")}>
      <FloatingShapes
        shapes={[
          { name: "plus", x: 8, y: 30, size: 7, color: PALETTE.sky, spin: 8 },
          { name: "ring", x: 82, y: 26, size: 11, color: PALETTE.forest },
          { name: "star", x: 80, y: 62, size: 9, color: PALETTE.scarf, spin: 12 },
          { name: "circle", x: 4, y: 66, size: 6, color: PALETTE.ember },
        ]}
      />
      <Reveal className="text-[11cqw] leading-[1] font-black tracking-tight">
        <span>Exploraste</span>
        <span>o catálogo.</span>
      </Reveal>
      <div className="relative mx-auto w-[64cqw]">
        <svg viewBox="0 0 100 100" className="w-full -rotate-90" aria-hidden>
          <circle cx={50} cy={50} r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={9} />
          <motion.circle
            cx={50}
            cy={50}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={9}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: share }}
            transition={{ duration: 1.8, delay: 0.6, ease: EASE }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[17cqw] font-black tracking-tighter">
          <CountUp value={pct} delay={0.6} />%
        </div>
      </div>
      <Appear delay={1.6} className="flex flex-col gap-2 text-[clamp(15px,5.3cqw,20px)] leading-snug font-semibold">
        <p>
          Ouviste {formatNumber(data.raw.unique_songs)} músicas diferentes de{" "}
          {formatNumber(data.raw.unique_artists)} artistas.
        </p>
        <p className="opacity-85">É {pct}% de tudo o que há no ScoutBangers.</p>
      </Appear>
    </div>
  )
}

// ===== 11. scout group ================================================

export function ScoutGroupSlide({ data }: { data: Wrapped }) {
  const reg = data.raw.regiao_rank
  const agr = data.raw.agrupamento_rank
  const main = agr ?? reg!
  const where = agr ? `no Agrupamento ${agr.numero}` : `na região de ${reg!.name}`
  return (
    <div className={cn(frame, "justify-between")}>
      <CompassRose color={PALETTE.cream} />
      <Reveal className="text-[8cqw] leading-tight font-bold">
        <span>{where.charAt(0).toUpperCase() + where.slice(1)},</span>
        <span>és o ouvinte</span>
      </Reveal>
      <motion.div
        className="-ml-1 flex items-start text-[52cqw] leading-[0.8] font-black tracking-[-0.08em]"
        initial={{ opacity: 0, y: 80 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 160, damping: 16 }}
      >
        <span className="mt-[3cqw] text-[14cqw] tracking-tight">nº</span>
        {main.rank}
      </motion.div>
      <Appear delay={1.3} className="flex flex-col gap-2 text-[clamp(15px,5.3cqw,20px)] leading-snug font-semibold">
        <p>
          de {formatNumber(main.size)} ouvintes.
          {main.rank === 1 ? " Ninguém ouviu mais do que tu." : ""}
        </p>
        {agr && reg ? (
          <p className="opacity-85">
            Na região de {reg.name}: nº {reg.rank} de {formatNumber(reg.size)}.
          </p>
        ) : null}
      </Appear>
    </div>
  )
}

// ===== 12. medals =====================================================

export function MedalsSlide({ data }: { data: Wrapped }) {
  const b = data.raw.badges
  const total = b.gold + b.silver + b.bronze
  const tiers = [
    { label: "1.º lugar", count: b.gold, color: "#f5c542" },
    { label: "2.º lugar", count: b.silver, color: "#d9dde3" },
    { label: "3.º lugar", count: b.bronze, color: "#c77b3f" },
  ]
  return (
    <div className={cn(frame, "justify-between")}>
      <Confetti colors={[PALETTE.scarf, PALETTE.cream, PALETTE.ember, PALETTE.sky]} />
      <Reveal className="text-[11cqw] leading-[1] font-black tracking-tight">
        <span>Subiste ao</span>
        <span>pódio.</span>
      </Reveal>
      <div className="flex items-end justify-center gap-[4cqw]">
        {[tiers[1]!, tiers[0]!, tiers[2]!].map((t, i) => (
          <motion.div
            key={t.label}
            className="flex flex-col items-center gap-2"
            initial={{ opacity: 0, y: -160 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.2, type: "spring", stiffness: 220, damping: 12 }}
          >
            <div
              className={cn(
                "flex items-center justify-center rounded-full shadow-xl",
                i === 1 ? "size-[30cqw]" : "size-[22cqw]",
                t.count === 0 && "opacity-35"
              )}
              style={{ backgroundColor: t.color, color: PALETTE.ink }}
            >
              <Medal className="size-1/2" />
            </div>
            <span className="text-[8cqw] font-black tabular-nums">{t.count}×</span>
            <span className="text-sm font-semibold opacity-80">{t.label}</span>
          </motion.div>
        ))}
      </div>
      <Appear delay={1.4} className="text-[clamp(15px,5.3cqw,20px)] leading-snug font-semibold">
        <p>
          Foste um dos 3 maiores ouvintes da semana {total}{" "}
          {total === 1 ? "vez" : "vezes"} este ano.
        </p>
      </Appear>
    </div>
  )
}

// ===== 14. summary ====================================================

export function SummarySlide({
  data,
  name,
  avatarUrl,
}: {
  data: Wrapped
  name: string
  avatarUrl: string | null
}) {
  const { restart } = useStory()
  const top = data.topSongs[0]
  return (
    // A size container, so the lists can stack by the frame's proportions.
    <div className="isolate absolute inset-0 flex flex-col px-4 pt-20 pb-20 [container-type:size]">
      <motion.div
        className="flex min-h-0 flex-1 flex-col"
        initial={{ opacity: 0, scale: 0.9, rotate: 3 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 20 }}
      >
        <Stitched
          thread={PALETTE.cream}
          radius={30}
          // Spread over the whole card: no hole in the middle on tall phones.
          className="flex min-h-0 flex-1 flex-col justify-between gap-[4cqw] px-[7cqw] py-[7cqw]"
        >
          <div className="flex items-center gap-[5cqw]">
            <div className="relative size-[34cqw] shrink-0">
              <div
                className="absolute inset-0 translate-x-[2.5cqw] translate-y-[2.5cqw] rounded-[3cqw]"
                style={{ backgroundColor: PALETTE.scarf }}
              />
              <Cover
                songId={top?.song.id}
                modifiedTime={top?.song.modifiedTime}
                size="full"
                className="relative size-full rounded-[3cqw]"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="size-[13cqw] rounded-full object-cover" />
              ) : null}
              <span className="line-clamp-3 text-[7.5cqw] leading-[1.02] font-black tracking-tight break-words">
                {name}
              </span>
            </div>
          </div>

          {/* Side by side; stacked, full width (so the titles fit) when the
              frame is tall and narrow enough to have the height to spare. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-[4cqw] [@container(max-aspect-ratio:10/21)]:grid-cols-1">
            <SummaryList title="Top artistas" items={data.topArtists.map((a) => a.name)} />
            <SummaryList title="Top músicas" items={data.topSongs.map((s) => s.title)} delay={0.8} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <span className="text-xs font-semibold opacity-75">Minutos a ouvir</span>
              <span className="text-[9.5cqw] leading-tight font-black tabular-nums">
                {formatNumber(data.minutes)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold opacity-75">Perfil de ouvinte</span>
              <span className="text-[5cqw] leading-tight font-black">
                <data.persona.icon aria-hidden className="mr-1 inline size-[1em] align-[-0.12em]" strokeWidth={2.25} />
                {data.persona.name}
              </span>
            </div>
          </div>
        </Stitched>
      </motion.div>
      <div className="flex justify-center pt-3">
        <StoryButton onClick={restart} className="px-4 py-2 text-sm underline-offset-4 hover:underline">
          Ver outra vez
        </StoryButton>
      </div>
    </div>
  )
}

function SummaryList({
  title,
  items,
  delay = 0.4,
}: {
  title: string
  items: string[]
  delay?: number
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold opacity-75">{title}</span>
      <ol className="flex flex-col gap-1">
        {items.slice(0, 5).map((item, i) => (
          <motion.li
            key={`${i}-${item}`}
            className="flex min-w-0 gap-2 text-[4.4cqw] leading-snug font-bold"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: delay + i * 0.08 }}
          >
            <span className="tabular-nums opacity-70">{i + 1}</span>
            <span className="truncate">{item}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
