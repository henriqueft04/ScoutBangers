import { Compass, Flame, Sunrise, Sunset, Tent, type LucideIcon } from "lucide-react"

import type { Profile } from "@/hooks/auth-context"

import { displayArtist, displayTitle } from "./song-display"
import { addedAt } from "./sort"
import { getCached, setCached } from "./storage"
import { supabase } from "./supabase"
import type { Song } from "./types"

/**
 * ScoutBangers Wrapped — the year-in-listening story at /wrapped.
 *
 * Everything comes from one RPC (`wrapped_for_user`, migration 0042) that
 * returns a jsonb document; this module types it, caches it, joins song ids
 * to the catalog and derives the bits that are pure presentation (the
 * listening persona, the peak month…).
 */

// ===== season ===========================================================

/** Wrapped opens on Dec 1 and closes at the end of January. */
export function isWrappedSeason(now = new Date()): boolean {
  const month = now.getMonth()
  return month === 11 || month === 0
}

/** The year being wrapped: this year in December, last year in January. */
export function wrappedYear(now = new Date()): number {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
}

/** In season for everyone; out of season only for admins with ?preview=1. */
export function canOpenWrapped(
  profile: Pick<Profile, "is_admin"> | null,
  search: string,
  now = new Date()
): boolean {
  if (isWrappedSeason(now)) return true
  return Boolean(profile?.is_admin) && new URLSearchParams(search).has("preview")
}

/** Fewer plays than this and there's not enough of a story to tell. */
export const WRAPPED_MIN_PLAYS = 10

// ===== raw RPC shape ====================================================

interface RawRank {
  rank: number
  size: number
}

export interface WrappedRaw {
  year: number
  total_plays: number
  total_seconds: number
  unique_songs: number
  unique_artists: number
  active_days: number
  first_play: { song_id: string; played_at: string } | null
  top_songs: {
    song_id: string
    plays: number
    seconds: number
    first_played_at: string
    best_day: string | null
    best_day_plays: number | null
  }[]
  top_artists: { artist: string; plays: number; seconds: number }[]
  by_month: number[]
  by_hour: number[]
  /** 0 = Monday … 6 = Sunday. */
  by_weekday: number[]
  biggest_day: { date: string; plays: number; seconds: number } | null
  longest_streak: { days: number; start: string; end: string } | null
  /** % of the year's listeners with fewer plays. */
  percentile: number | null
  listeners_total: number
  regiao_rank: (RawRank & { name: string }) | null
  agrupamento_rank: (RawRank & { numero: number }) | null
  top_artist_fan_rank: { rank: number; fans: number } | null
  badges: { gold: number; silver: number; bronze: number }
  community: {
    total_plays: number
    total_seconds: number
    listeners: number
    top_song_id: string | null
    top_artist: string | null
    // ScoutBangers' own year. Optional: a cached result from before these
    // fields existed doesn't carry them.
    top_songs?: { song_id: string; plays: number }[]
    by_month?: number[]
    /** New accounts per month of the year. */
    signups_by_month?: number[]
    /** Accounts created before the year started. */
    users_before?: number
    users_total?: number
    playlists_created?: number
    biggest_day?: { date: string; plays: number } | null
    top_regiao?: { name: string; plays: number } | null
  }
}

const CACHE_TTL_MS = 60 * 60 * 1000
/**
 * Bump when the RPC's result changes shape, so a result cached from the
 * older function isn't shown for another hour.
 */
const CACHE_VERSION = 2
const cacheKey = (uid: string, year: number) =>
  `scoutbangers:wrapped:v${CACHE_VERSION}:${uid}:${year}`

/**
 * Fetches the user's Wrapped. Cached for an hour so reopening the story (or
 * "Ver outra vez") is instant. Returns null when the RPC has nothing (not
 * signed in as that user).
 */
export async function fetchWrapped(
  uid: string,
  year: number,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<WrappedRaw | null> {
  const key = cacheKey(uid, year)
  if (!fresh) {
    const cached = getCached<WrappedRaw>(key)
    if (cached) return cached
  }
  if (!supabase) throw new Error("A ligação ao servidor não está configurada.")
  const { data, error } = await supabase.rpc("wrapped_for_user", {
    uid,
    yr: year,
  })
  if (error) throw new Error(error.message)
  const raw = (data ?? null) as WrappedRaw | null
  if (raw) setCached(key, raw, CACHE_TTL_MS)
  return raw
}

// ===== presentation model ===============================================

export interface WrappedSong {
  song: Song
  title: string
  artist?: string
  plays: number
  minutes: number
  firstPlayedAt: Date
  bestDay: Date | null
  bestDayPlays: number
}

export interface WrappedArtist {
  name: string
  plays: number
  minutes: number
  /** Their most-played song (of the user's top songs, else the catalog). */
  soundtrackId?: string
}

export interface Persona {
  id: "alvorada" | "tarde" | "reuniao" | "fogueira" | "fimdesemana"
  name: string
  tagline: string
  /** Drawn for the time of day it stands for, whatever the name. */
  icon: LucideIcon
  /** Patch colours: field, thread. */
  field: string
  thread: string
}

export interface Wrapped {
  year: number
  raw: WrappedRaw
  minutes: number
  hours: number
  topSongs: WrappedSong[]
  topArtists: WrappedArtist[]
  /** 0–11 */
  peakMonth: number | null
  peakHour: number
  /** 0 = Monday */
  favouriteWeekday: number
  weekendShare: number
  persona: Persona
  /** Fraction of the current catalog the user heard. */
  catalogShare: number | null
  firstSong: Song | null
  communityTopSong: Song | null
  app: AppYear
  /** "Top X%" — null when it isn't flattering enough to show (outside top 50%). */
  topPercent: number | null
  enoughData: boolean
}

/** ScoutBangers' own Wrapped: how the app grew this year. */
export interface AppYear {
  /** Accounts at the end of each month so far (cumulative). */
  usersByMonth: number[]
  usersStart: number
  usersEnd: number
  /** Songs added to the catalog per month, and in total this year. */
  songsAddedByMonth: number[]
  songsAdded: number
  catalogSize: number
  playsByMonth: number[]
  topSongs: { song: Song; plays: number }[]
  playlistsCreated: number
  biggestDay: { date: Date; plays: number } | null
  topRegiao: { name: string; plays: number } | null
  /** Months shown on the growth charts: from the first with activity. */
  firstMonth: number
  lastMonth: number
}

export const PALETTE = {
  maroon: "#7b2d26",
  maroonDeep: "#4a1712",
  scarf: "#f2c230",
  forest: "#1f4d3a",
  pine: "#0f2a1f",
  sky: "#9fd3e6",
  cream: "#f0f3f5",
  ink: "#21110e",
  ember: "#e8622c",
} as const

type PersonaDef = Omit<Persona, "tagline"> & {
  /** `song` is the listener's most-played song title, as is. */
  tagline: (song: string) => string
}

const PERSONAS: Record<Persona["id"], PersonaDef> = {
  alvorada: {
    id: "alvorada",
    name: "Tropa da Alvorada",
    tagline: () =>
      "És a pessoa chata que, ainda nem toda a gente saiu do saco-cama, e já está a cantar aos berros \"VOU SALTAAAAAR SEM OLHAAAAR PARA O FUNDOOOOOOO\".",
    icon: Sunrise,
    field: PALETTE.scarf,
    thread: PALETTE.maroon,
  },
  tarde: {
    id: "tarde",
    name: "Escuteiro a Tempo Inteiro",
    tagline: (song) =>
      `Há quem ouça Spotify na escola ou no trabalho. Tu, por algum motivo, preferes ouvir ${song} em loop.`,
    icon: Compass,
    field: PALETTE.sky,
    thread: PALETTE.pine,
  },
  reuniao: {
    id: "reuniao",
    name: "Fugitivo da Vida Real",
    tagline: (song) =>
      `Chegas a casa depois de um dia cansativo e, em vez de ir trabalhar, jogar ou beber um café, vais ouvir ${song} em loop. Tens mesmo de arranjar mais hobbies.`,
    icon: Sunset,
    field: PALETTE.forest,
    thread: PALETTE.scarf,
  },
  fogueira: {
    id: "fogueira",
    name: "Mestre do Fogo de Conselho",
    tagline: () =>
      "És a prova de que a hora de acordar não tem nada a ver com a hora de ir dormir, às vezes podem é coincidir. A música só acaba quando decides finalmente ir dormir.",
    icon: Flame,
    field: PALETTE.ember,
    thread: PALETTE.ink,
  },
  fimdesemana: {
    id: "fimdesemana",
    name: "Escuteiro de Fim de Semana",
    tagline: (song) =>
      `Como se não bastasse os teus familiares não te terem em casa ao fim de semana, quando chegas ainda os obrigas a ouvir música escutista. Estás muito provavelmente a um play de ${song} de seres expulso de casa.`,
    icon: Tent,
    field: PALETTE.maroon,
    thread: PALETTE.scarf,
  },
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const argmax = (xs: number[]) =>
  xs.reduce((best, x, i) => (x > (xs[best] ?? -Infinity) ? i : best), 0)

/**
 * The persona is picked from when the user listens. `favouriteSong` (their
 * most-played title) goes into the taglines that name a song.
 */
export function derivePersona(
  byHour: number[],
  byWeekday: number[],
  favouriteSong?: string
): Persona {
  const song = favouriteSong ?? "as tuas músicas preferidas"
  const make = (def: PersonaDef): Persona => ({ ...def, tagline: def.tagline(song) })
  const total = sum(byWeekday)
  const weekend = (byWeekday[5] ?? 0) + (byWeekday[6] ?? 0)
  if (total > 0 && weekend / total > 0.45) return make(PERSONAS.fimdesemana)
  // Bands, by share of plays rather than single peak hour, so one late
  // night doesn't make a morning person a night owl.
  const band = (from: number, to: number) => {
    let s = 0
    for (let h = from; h !== to; h = (h + 1) % 24) s += byHour[h] ?? 0
    return s
  }
  // Plays per hour of each band (they are 6, 6, 4 and 8 hours long).
  const bands: [Persona["id"], number][] = [
    ["alvorada", band(5, 11) / 6],
    ["tarde", band(11, 17) / 6],
    ["reuniao", band(17, 21) / 4],
    ["fogueira", band(21, 5) / 8],
  ]
  const [best] = bands.reduce((a, b) => (b[1] > a[1] ? b : a))
  return make(PERSONAS[best])
}

/** Joins the RPC result to the catalog and derives the story's numbers. */
export function buildWrapped(raw: WrappedRaw, songs: readonly Song[]): Wrapped {
  const byId = new Map(songs.map((s) => [s.id, s]))

  const topSongs: WrappedSong[] = []
  for (const row of raw.top_songs ?? []) {
    const song = byId.get(row.song_id)
    if (!song) continue // removed from the catalog since
    topSongs.push({
      song,
      title: displayTitle(song),
      artist: displayArtist(song),
      plays: row.plays,
      minutes: Math.round(row.seconds / 60),
      firstPlayedAt: new Date(row.first_played_at),
      bestDay: row.best_day ? new Date(`${row.best_day}T12:00:00`) : null,
      bestDayPlays: row.best_day_plays ?? 0,
    })
  }

  const topArtists: WrappedArtist[] = (raw.top_artists ?? []).map((a) => {
    const own = topSongs.find((s) => s.artist === a.artist)
    const any = own ? undefined : songs.find((s) => s.artist === a.artist)
    return {
      name: a.artist,
      plays: a.plays,
      minutes: Math.round(a.seconds / 60),
      soundtrackId: own?.song.id ?? any?.id,
    }
  })

  const byMonth = raw.by_month ?? []
  const byHour = raw.by_hour ?? []
  const byWeekday = raw.by_weekday ?? []
  const weekdayTotal = sum(byWeekday)

  const minutes = Math.round(raw.total_seconds / 60)
  const topPercent =
    raw.percentile !== null && raw.listeners_total >= 5
      ? Math.max(1, 100 - raw.percentile)
      : null

  return {
    year: raw.year,
    raw,
    minutes,
    hours: Math.round(raw.total_seconds / 3600),
    topSongs,
    topArtists,
    peakMonth: sum(byMonth) > 0 ? argmax(byMonth) : null,
    peakHour: argmax(byHour),
    favouriteWeekday: argmax(byWeekday),
    weekendShare:
      weekdayTotal > 0 ? ((byWeekday[5] ?? 0) + (byWeekday[6] ?? 0)) / weekdayTotal : 0,
    persona: derivePersona(byHour, byWeekday, topSongs[0]?.title),
    catalogShare:
      songs.length > 0 ? Math.min(1, raw.unique_songs / songs.length) : null,
    firstSong: raw.first_play ? byId.get(raw.first_play.song_id) ?? null : null,
    communityTopSong: raw.community?.top_song_id
      ? byId.get(raw.community.top_song_id) ?? null
      : null,
    app: buildAppYear(raw, songs, byId),
    topPercent: topPercent !== null && topPercent <= 50 ? topPercent : null,
    enoughData: raw.total_plays >= WRAPPED_MIN_PLAYS,
  }
}

function buildAppYear(
  raw: WrappedRaw,
  songs: readonly Song[],
  byId: Map<string, Song>
): AppYear {
  const c = raw.community
  const year = raw.year
  const now = new Date()
  // Months that have happened (the whole year once it's over).
  const lastMonth = now.getFullYear() > year ? 11 : now.getMonth()

  const songsAddedByMonth = new Array<number>(12).fill(0)
  for (const song of songs) {
    const at = new Date(addedAt(song))
    if (at.getFullYear() === year) songsAddedByMonth[at.getMonth()]! += 1
  }

  const usersStart = c.users_before ?? 0
  const signups = c.signups_by_month ?? new Array<number>(12).fill(0)
  let running = usersStart
  const usersByMonth = signups.map((n) => (running += n))

  const playsByMonth = c.by_month ?? new Array<number>(12).fill(0)
  const active = (xs: number[]) => xs.findIndex((x) => x > 0)
  const firstMonth = Math.max(
    0,
    Math.min(
      ...[active(playsByMonth), active(signups), active(songsAddedByMonth)].filter((i) => i >= 0),
      lastMonth
    )
  )

  return {
    usersByMonth,
    usersStart,
    usersEnd: c.users_total ?? running,
    songsAddedByMonth,
    songsAdded: sum(songsAddedByMonth),
    catalogSize: songs.length,
    playsByMonth,
    topSongs: (c.top_songs ?? [])
      .map((r) => ({ song: byId.get(r.song_id), plays: r.plays }))
      .filter((r): r is { song: Song; plays: number } => Boolean(r.song)),
    playlistsCreated: c.playlists_created ?? 0,
    biggestDay: c.biggest_day
      ? { date: new Date(`${c.biggest_day.date}T12:00:00`), plays: c.biggest_day.plays }
      : null,
    topRegiao: c.top_regiao ?? null,
    firstMonth,
    lastMonth,
  }
}

// ===== formatting =======================================================

const numberFmt = new Intl.NumberFormat("pt-PT")
export const formatNumber = (n: number) => numberFmt.format(Math.round(n))

export const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]
export const MONTHS_SHORT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]
export const WEEKDAYS = [
  "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira",
  "sexta-feira", "sábado", "domingo",
]

export function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long" }).format(date)
}

/** "isso são 3 dias e 4 horas" style phrasing for a minute count. */
export function minutesInWords(minutes: number): string {
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days >= 1) {
    const d = `${days} ${days === 1 ? "dia" : "dias"}`
    return hours > 0 ? `${d} e ${hours} ${hours === 1 ? "hora" : "horas"}` : d
  }
  const h = Math.max(1, Math.round(minutes / 60))
  return `${h} ${h === 1 ? "hora" : "horas"}`
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const monthName = (m: number) => capitalise(MONTHS[m] ?? "")
