import { motion } from "framer-motion"

import { cn } from "@workspace/ui/lib/utils"

import { displayArtist, displayTitle } from "@/lib/song-display"
import { WRAPPED_ORIGINS } from "@/lib/wrapped-origins"
import {
  formatDay,
  formatNumber,
  MONTHS_SHORT,
  PALETTE as C,
  type Wrapped,
} from "@/lib/wrapped"

import { FloatingShapes, GradientBlobs, TypeBand } from "./fx"
import { Appear, CountUp, Cover, EASE, Reveal } from "./primitives"

/*
 * "E o ScoutBangers?" — the app's own Wrapped, after the personal slides:
 * how many joined, how much was played, what entered the catalog and what
 * everyone listened to most.
 */

const frame = "@container isolate absolute inset-0 flex flex-col px-7 pt-24 pb-24"

// ===== intro ===========================================================

export function AppIntroSlide({ year }: { year: number }) {
  return (
    <div className={cn(frame, "justify-center")}>
      <TypeBand text="SCOUTBANGERS" color={C.ink} bg={C.scarf} top="17%" rotate={-12} speed={10} />
      <TypeBand text={`${year}`} color={C.sky} top="34%" rotate={7} speed={16} reverse outline />
      <TypeBand text="BANGERS BANGERS" color={C.cream} bg={C.maroon} top="80%" rotate={-5} speed={12} reverse />
      <motion.img
        src="/SB-Circle.png"
        alt=""
        className="mx-auto mb-8 w-[46cqw] rounded-full shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        initial={{ scale: 0, rotate: -270 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 110, damping: 13, delay: 0.3 }}
      />
      <Reveal delay={0.8} className="text-[11cqw] leading-[1] font-black tracking-tight">
        <span>E o</span>
        <span>ScoutBangers?</span>
      </Reveal>
      <Appear delay={1.5} className="mt-4 text-[clamp(15px,5.3cqw,20px)] font-semibold">
        O nosso ano também foi de bangers. Vê só.
      </Appear>
    </div>
  )
}

// ===== how it started ==================================================

/** Seconds before today's screen wipes over the first day's. */
const WIPE_AT = 4

export function AppOriginsSlide({ data }: { data: Wrapped }) {
  const o = WRAPPED_ORIGINS
  const firstDay = new Date(`${o.firstDay}T12:00:00`)
  const day = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long", year: "numeric" }).format(firstDay)
  return (
    <div className={cn(frame, "justify-between gap-4")}>
      <FloatingShapes
        shapes={[
          { name: "star", x: 84, y: 30, size: 11, color: C.scarf, spin: 14 },
          { name: "ring", x: 2, y: 62, size: 12, color: C.ember },
          { name: "plus", x: 86, y: 70, size: 7, color: C.sky, spin: 9 },
        ]}
      />
      <Reveal className="text-[8.5cqw] leading-[1.05] font-black tracking-tight">
        <span>{day}.</span>
        <span>Foi assim que</span>
        <span>tudo começou.</span>
      </Reveal>

      <div className="relative mx-auto">
        {/* Day 1 / Hoje sticker, swapping at the wipe. */}
        <motion.div
          className="absolute -top-[4cqw] -left-[10cqw] z-10 rotate-[-10deg] rounded-full px-[3.5cqw] py-[1.5cqw] text-[4.2cqw] font-black shadow-lg"
          style={{ backgroundColor: C.scarf, color: C.ink }}
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1, 1, 0] }}
          transition={{ delay: 0.9, duration: WIPE_AT - 0.6, times: [0, 0.12, 0.92, 1] }}
        >
          Dia 1
        </motion.div>
        <motion.div
          className="absolute -top-[4cqw] -right-[10cqw] z-10 rotate-[8deg] rounded-full px-[3.5cqw] py-[1.5cqw] text-[4.2cqw] font-black shadow-lg"
          style={{ backgroundColor: C.sky, color: C.ink }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: WIPE_AT + 0.9, type: "spring", stiffness: 400, damping: 14 }}
        >
          Hoje
        </motion.div>

        {/* The phone. */}
        <motion.div
          className="relative w-[41cqw] overflow-hidden rounded-[6cqw] border-[1.8cqw] shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
          style={{ borderColor: C.ink, backgroundColor: C.ink }}
          initial={{ y: 80, rotate: -12, opacity: 0 }}
          animate={{ y: 0, rotate: [-12, -3, -3, 2, 0], opacity: 1, scale: [1, 1, 1, 1.05, 1] }}
          transition={{
            delay: 0.4,
            duration: WIPE_AT + 0.6,
            times: [0, 0.2, 0.86, 0.93, 1],
            opacity: { delay: 0.4, duration: 0.4 },
            y: { delay: 0.4, type: "spring", stiffness: 120, damping: 16 },
          }}
        >
          <img
            src={o.before}
            alt="O ScoutBangers no primeiro dia: só uma lista de músicas e um player."
            className="block aspect-[390/844] w-full rounded-[4cqw] object-cover"
            draggable={false}
          />
          <motion.img
            src={o.after}
            alt="O ScoutBangers hoje: capas, álbuns, favoritos e navegação."
            className="absolute inset-0 block size-full rounded-[4cqw] object-cover"
            draggable={false}
            initial={{ clipPath: "inset(100% 0 0 0)" }}
            animate={{ clipPath: "inset(0% 0 0 0)" }}
            transition={{ delay: WIPE_AT, duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
          />
          {/* The light bar riding the wipe's edge. */}
          <motion.div
            aria-hidden
            className="absolute inset-x-0 h-[1.6cqw] shadow-[0_0_24px_8px_rgba(242,194,48,0.7)]"
            style={{ backgroundColor: C.scarf }}
            initial={{ top: "100%", opacity: 0 }}
            animate={{ top: ["100%", "0%"], opacity: [1, 1, 0] }}
            transition={{ delay: WIPE_AT, duration: 1.1, ease: [0.65, 0, 0.35, 1], opacity: { delay: WIPE_AT, duration: 1.3, times: [0, 0.85, 1] } }}
          />
        </motion.div>
      </div>

      <div className="relative min-h-[22cqw] text-[4.4cqw] leading-snug font-semibold">
        <motion.p
          className="absolute inset-x-0 top-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ delay: 1.2, duration: WIPE_AT - 0.8, times: [0, 0.15, 0.85, 1] }}
        >
          Uma lista de {o.songsOnDayOne} músicas, sem capas, em inglês, e um botão de play.
        </motion.p>
        <Appear delay={WIPE_AT + 1.2} className="absolute inset-x-0 top-0">
          Hoje: {formatNumber(data.app.catalogSize)} músicas,{" "}
          {data.app.usersEnd > 0 ? `${formatNumber(data.app.usersEnd)} escuteiros, ` : ""}
          álbuns, playlists, jams e letras.
        </Appear>
      </div>
    </div>
  )
}

// ===== growth ==========================================================

/** Cumulative line + area, drawn left to right. */
function GrowthChart({ values, months, color }: { values: number[]; months: number[]; color: string }) {
  const W = 300
  const H = 160
  const max = Math.max(1, ...values)
  const min = Math.min(...values)
  const span = Math.max(1, max - min * 0.85)
  const pts = values.map((v, i) => [
    values.length === 1 ? W / 2 : (i / (values.length - 1)) * W,
    H - ((v - min * 0.85) / span) * (H - 12) - 6,
  ])
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x!.toFixed(1)} ${y!.toFixed(1)}`).join(" ")
  const area = `${line} L${W} ${H} L0 ${H} Z`
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" aria-hidden>
        <motion.path
          d={area}
          fill={color}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.18 }}
          transition={{ delay: 1.6, duration: 0.8 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.8, delay: 0.5, ease: "easeInOut" }}
        />
        {pts.map(([x, y], i) => (
          <motion.circle
            key={i}
            cx={x}
            cy={y}
            r={i === pts.length - 1 ? 9 : 5}
            fill={color}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5 + (1.8 * i) / Math.max(1, pts.length - 1), type: "spring", stiffness: 400 }}
          />
        ))}
      </svg>
      <div className="flex justify-between text-xs font-bold opacity-70">
        {months.map((m) => (
          <span key={m}>{MONTHS_SHORT[m]}</span>
        ))}
      </div>
    </div>
  )
}

export function AppGrowthSlide({ data }: { data: Wrapped }) {
  const a = data.app
  const months = range(a.firstMonth, a.lastMonth)
  const values = months.map((m) => a.usersByMonth[m] ?? a.usersEnd)
  const joined = a.usersEnd - a.usersStart
  return (
    <div className={cn(frame, "justify-between")}>
      <FloatingShapes
        shapes={[
          { name: "star", x: 78, y: 12, size: 14, color: C.scarf, spin: 14 },
          { name: "ring", x: 84, y: 40, size: 10, color: C.maroon },
          { name: "plus", x: 84, y: 52, size: 8, color: C.maroonDeep, spin: 10 },
        ]}
      />
      <div className="flex flex-col">
        <Reveal className="text-[8cqw] leading-tight font-bold">
          <span>
            {a.usersStart > 0
              ? `Começámos o ano com ${formatNumber(a.usersStart)}.`
              : "Começámos do zero."}
          </span>
          <span>Agora somos</span>
        </Reveal>
        <div className="-ml-1 text-[30cqw] leading-[0.9] font-black tracking-[-0.06em]">
          <CountUp value={a.usersEnd} delay={0.5} duration={2.3} />
        </div>
        <Reveal delay={0.6} className="text-[9cqw] leading-none font-black">
          <span>escuteiros.</span>
        </Reveal>
      </div>
      {months.length >= 2 ? <GrowthChart values={values} months={months} color={C.maroonDeep} /> : null}
      <Appear delay={2.4} className="text-[clamp(15px,5.3cqw,20px)] leading-snug font-semibold">
        <p>
          {formatNumber(joined)} {joined === 1 ? "conta nova" : "contas novas"} em {data.year}.
          Obrigado por espalharem a palavra.
        </p>
      </Appear>
    </div>
  )
}

// ===== plays ===========================================================

export function AppPlaysSlide({ data }: { data: Wrapped }) {
  const a = data.app
  const c = data.raw.community
  const months = range(a.firstMonth, a.lastMonth)
  const max = Math.max(1, ...months.map((m) => a.playsByMonth[m] ?? 0))
  return (
    <div className={cn(frame, "justify-between")}>
      <GradientBlobs colors={[C.ember, C.maroonDeep, C.scarf]} />
      <div className="flex flex-col">
        <Reveal className="text-[8cqw] leading-tight font-bold">
          <span>Todos juntos, tocámos</span>
        </Reveal>
        <div className="-ml-1 text-[21cqw] leading-[0.95] font-black tracking-[-0.06em]">
          <CountUp value={c.total_plays} delay={0.4} duration={2.4} />
        </div>
        <Reveal delay={0.5} className="text-[9cqw] leading-none font-black">
          <span>músicas.</span>
        </Reveal>
      </div>
      <div className="flex h-[22%] items-end gap-[1.2cqw]" aria-hidden>
        {months.map((m, i) => (
          <div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <motion.div
              className="w-full origin-bottom rounded-t-[1.2cqw]"
              style={{ height: `${Math.max(4, ((a.playsByMonth[m] ?? 0) / max) * 100)}%`, backgroundColor: "currentColor" }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 1 + i * 0.06, duration: 0.8, ease: EASE }}
            />
            <span className="text-[10px] font-bold opacity-70">{MONTHS_SHORT[m]}</span>
          </div>
        ))}
      </div>
      <Appear delay={1.9} className="flex flex-col gap-2 text-[clamp(14px,4.8cqw,18px)] leading-snug font-semibold">
        <p>
          {formatNumber(Math.round(c.total_seconds / 3600))} horas de música entre{" "}
          {formatNumber(c.listeners)} ouvintes.
        </p>
        {a.biggestDay ? (
          <p className="opacity-85">
            O dia maior foi {formatDay(a.biggestDay.date)}: {formatNumber(a.biggestDay.plays)}{" "}
            músicas num só dia.
          </p>
        ) : null}
      </Appear>
    </div>
  )
}

// ===== catalogue =======================================================

export function AppCatalogSlide({ data }: { data: Wrapped }) {
  const a = data.app
  // One tile per song; past 120 songs, each tile stands for several.
  const per = Math.max(1, Math.ceil(a.songsAdded / 120))
  const tiles = Math.ceil(a.songsAdded / per)
  const colors = [C.maroon, C.forest, C.ember, C.ink, C.sky]
  return (
    <div className={cn(frame, "justify-between")}>
      <Reveal className="text-[10cqw] leading-[1] font-black tracking-tight">
        <span>Entraram</span>
        <span>
          <CountUp value={a.songsAdded} delay={0.4} /> músicas
        </span>
        <span>novas.</span>
      </Reveal>
      <div className="grid grid-cols-12 gap-[1cqw]" aria-hidden>
        {Array.from({ length: tiles }, (_, i) => (
          <motion.div
            key={i}
            className="aspect-square rounded-[0.8cqw]"
            style={{ backgroundColor: colors[(i * 7) % colors.length] }}
            initial={{ scale: 0, rotate: 45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.6 + i * (1.6 / tiles), type: "spring", stiffness: 500, damping: 18 }}
          />
        ))}
      </div>
      <Appear delay={2.4} className="flex flex-col gap-2 text-[clamp(14px,4.8cqw,18px)] leading-snug font-semibold">
        <p>
          O catálogo tem agora {formatNumber(a.catalogSize)} músicas
          {per > 1 ? ` (cada quadrado são ${per})` : ""}.
        </p>
        {a.playlistsCreated > 0 ? (
          <p className="opacity-85">E vocês criaram {formatNumber(a.playlistsCreated)} playlists.</p>
        ) : null}
      </Appear>
    </div>
  )
}

// ===== everyone's top ==================================================

export function AppTopSlide({ data }: { data: Wrapped }) {
  const a = data.app
  return (
    <div className={cn(frame, "justify-center gap-7")}>
      <TypeBand text="TOP DA MALTA" color={C.forest} bg={C.cream} top="89%" rotate={-4} speed={12} />
      <Reveal delay={0.2} className="text-[10cqw] leading-[1] font-black tracking-tight">
        <span>O que toda a</span>
        <span>gente mais ouviu</span>
      </Reveal>
      <ol className="flex flex-col gap-3.5">
        {a.topSongs.map((t, i) => (
          <motion.li
            key={t.song.id}
            className="flex items-center gap-3"
            initial={{ opacity: 0, y: 40, rotate: i % 2 ? 4 : -4 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ delay: 0.7 + i * 0.14, type: "spring", stiffness: 220, damping: 18 }}
          >
            <span className="w-[8cqw] shrink-0 text-[8cqw] leading-none font-black tabular-nums">{i + 1}</span>
            <Cover
              songId={t.song.id}
              modifiedTime={t.song.modifiedTime}
              className="size-[13cqw] shrink-0 rounded-[2cqw]"
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[5.2cqw] font-extrabold tracking-tight">{displayTitle(t.song)}</span>
              <span className="truncate text-sm font-semibold opacity-75">
                {displayArtist(t.song) ? `${displayArtist(t.song)}, ` : ""}
                {formatNumber(t.plays)}×
              </span>
            </div>
          </motion.li>
        ))}
      </ol>
      {a.topRegiao ? (
        <Appear delay={1.8} className="text-[clamp(14px,4.8cqw,18px)] leading-snug font-semibold">
          A região que mais ouviu: {a.topRegiao.name}, com {formatNumber(a.topRegiao.plays)} músicas.
        </Appear>
      ) : null}
    </div>
  )
}

function range(from: number, to: number): number[] {
  const out: number[] = []
  for (let m = from; m <= to; m++) out.push(m)
  return out
}
