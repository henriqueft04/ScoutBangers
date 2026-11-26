import type { Song } from "./types"
import type { WrappedRaw } from "./wrapped"

/**
 * Dev-only stand-in for the `wrapped_for_user` RPC (`/wrapped?mock=1` under
 * `npm run dev`), built from the real catalog so covers and titles resolve.
 * Lets the story be designed and tested without a database or a sign-in.
 */
export function mockWrappedRaw(songs: readonly Song[], year: number): WrappedRaw {
  const picks = songs.slice(0, 40)
  const top = picks.slice(0, 5)
  const artists = [...new Set(picks.map((s) => s.artist).filter(Boolean))] as string[]
  const day = (m: number, d: number) =>
    `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  return {
    year,
    total_plays: 2481,
    total_seconds: 2481 * 192,
    unique_songs: Math.min(songs.length, 143),
    unique_artists: Math.max(artists.length, 37),
    active_days: 171,
    first_play: top[4] ? { song_id: top[4].id, played_at: `${day(5, 3)}T09:12:00Z` } : null,
    top_songs: top.map((s, i) => ({
      song_id: s.id,
      plays: 212 - i * 31,
      seconds: (212 - i * 31) * 190,
      first_played_at: `${day(5, 4 + i)}T18:00:00Z`,
      best_day: day(7, 14 + i),
      best_day_plays: 14 - i * 2,
    })),
    top_artists: (artists.length ? artists : ["Artista"]).slice(0, 5).map((a, i) => ({
      artist: a,
      plays: 540 - i * 87,
      seconds: (540 - i * 87) * 190,
    })),
    by_month: [0, 0, 0, 0, 180, 260, 410, 520, 330, 290, 340, 151],
    by_hour: [40, 22, 10, 4, 2, 3, 8, 30, 60, 75, 80, 90, 110, 95, 88, 92, 120, 150, 170, 190, 210, 230, 180, 110],
    by_weekday: [300, 280, 290, 310, 360, 520, 421],
    biggest_day: { date: day(8, 2), plays: 87, seconds: 87 * 190 },
    longest_streak: { days: 23, start: day(7, 10), end: day(8, 1) },
    percentile: 94,
    listeners_total: 312,
    regiao_rank: { name: "Lisboa", rank: 3, size: 41 },
    agrupamento_rank: { numero: 123, rank: 1, size: 9 },
    top_artist_fan_rank: { rank: 2, fans: 118 },
    badges: { gold: 2, silver: 1, bronze: 3 },
    community: {
      total_plays: 184_302,
      total_seconds: 184_302 * 188,
      listeners: 312,
      top_song_id: songs[7]?.id ?? top[0]?.id ?? null,
      top_artist: artists[0] ?? null,
      top_songs: songs.slice(7, 12).map((s, i) => ({ song_id: s.id, plays: 4210 - i * 520 })),
      by_month: [0, 0, 0, 0, 9800, 14300, 22100, 31500, 24800, 26900, 33400, 21500],
      signups_by_month: [0, 0, 0, 0, 96, 41, 58, 37, 22, 19, 27, 12],
      users_before: 0,
      users_total: 312,
      playlists_created: 187,
      biggest_day: { date: day(8, 15), plays: 2841 },
      top_regiao: { name: "Lisboa", plays: 61_220 },
    },
  }
}
