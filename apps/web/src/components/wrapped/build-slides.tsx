import { fetchArtistBanner } from "@/lib/artist-banners"
import { peekTrackMetadata } from "@/lib/track-metadata"
import {
  formatDay,
  formatNumber,
  minutesInWords,
  MONTHS,
  monthName,
  PALETTE as C,
  type Wrapped,
} from "@/lib/wrapped"
import type { ListCardInput, StatCardInput } from "@/lib/wrapped-card"

import type { SlideDef } from "./story-context"
import { ThanksSlide } from "./thanks-slide"
import { WRAPPED_ORIGINS } from "@/lib/wrapped-origins"

import {
  AppCatalogSlide,
  AppGrowthSlide,
  AppIntroSlide,
  AppOriginsSlide,
  AppPlaysSlide,
  AppTopSlide,
} from "./app-slides"
import {
  DaySlide,
  DiscoveriesSlide,
  IntroSlide,
  MedalsSlide,
  MinutesSlide,
  NotEnoughSlide,
  PersonaSlide,
  ScoutGroupSlide,
  SummarySlide,
  TopArtistSlide,
  TopArtistsSlide,
  TopSongSlide,
  TopSongsSlide,
  YearSlide,
} from "./slides"

interface Who {
  name: string
  avatarUrl: string | null
}

const cards = () => import("@/lib/wrapped-card")
const stat = (input: StatCardInput) => async () => (await cards()).renderStatCard(input)
const list = (input: ListCardInput) => async () => (await cards()).renderListCard(input)
const coverUrl = (id: string | undefined) => {
  if (!id) return null
  const m = peekTrackMetadata(id)
  return m?.pictureUrl ?? m?.thumbUrl ?? null
}

/**
 * The story, in order. Slides whose data is missing are left out, so a new
 * listener without a região or medals just gets a shorter story.
 */
export function buildSlides(data: Wrapped, who: Who): SlideDef[] {
  const year = data.year
  const intro: SlideDef = {
    id: "intro",
    duration: Infinity,
    bg: C.maroon,
    fg: C.cream,
    render: () => (
      <IntroSlide
        year={year}
        name={who.name.split(" ")[0] ?? who.name}
        covers={data.topSongs.map((s) => ({ id: s.song.id, modifiedTime: s.song.modifiedTime }))}
      />
    ),
  }

  if (!data.enoughData) {
    return [
      { ...intro, render: () => <NotEnoughSlide year={year} /> },
    ]
  }

  const songs = data.topSongs
  const [s1, s2, s3, s4, s5] = songs.map((s) => s.song.id)
  const topArtist = data.topArtists[0]
  const raw = data.raw
  const slides: (SlideDef | false | null | undefined)[] = [
    { ...intro, soundtrack: data.firstSong?.id ?? s5 ?? s1 },
    {
      id: "minutes",
      transition: "burst",
      accent: C.ember,
      burstWord: String(year),
      duration: 17000,
      bg: C.scarf,
      fg: C.maroonDeep,
      soundtrack: s3 ?? s1,
      share: async () =>
        (await cards()).renderStatCard({
          year,
          bg: C.scarf,
          fg: C.maroonDeep,
          kicker: `Em ${year} ouvi`,
          value: `${formatNumber(data.minutes)} min`,
          caption:
            data.topPercent !== null
              ? `Top ${data.topPercent}% dos ouvintes do ScoutBangers.`
              : `${minutesInWords(data.minutes)} de música.`,
        }),
      render: () => <MinutesSlide data={data} />,
    },
    data.peakMonth !== null && {
      id: "year",
      share: stat({
        year,
        bg: C.forest,
        fg: C.scarf,
        kicker: `O meu mês de ${year}`,
        value: monthName(data.peakMonth ?? 0),
        caption: `Toquei ${formatNumber(raw.by_month[data.peakMonth ?? 0] ?? 0)} músicas em ${MONTHS[data.peakMonth ?? 0]}. Ouvi música em ${formatNumber(raw.active_days)} dias.`,
      }),
      transition: "blinds",
      accent: C.scarf,
      duration: 15000,
      bg: C.forest,
      fg: C.scarf,
      soundtrack: s3 ?? s1,
      render: () => <YearSlide data={data} />,
    },
    raw.biggest_day && {
      id: "day",
      share: stat({
        year,
        bg: C.sky,
        fg: C.pine,
        kicker: "O meu dia mais barulhento",
        value: raw.biggest_day ? formatDay(new Date(`${raw.biggest_day.date}T12:00:00`)) : "",
        caption: `${formatNumber(raw.biggest_day?.plays ?? 0)} músicas num só dia.${
          raw.longest_streak && raw.longest_streak.days >= 3
            ? ` E ${raw.longest_streak.days} dias seguidos a ouvir.`
            : ""
        }`,
      }),
      transition: "iris",
      accent: C.cream,
      duration: 16000,
      bg: C.sky,
      fg: C.pine,
      soundtrack: s4 ?? s2 ?? s1,
      render: () => <DaySlide data={data} />,
    },
    {
      id: "persona",
      transition: "bubbles",
      accent: data.persona.field,
      duration: 19000,
      bg: C.cream,
      fg: C.ink,
      soundtrack: s4 ?? s2 ?? s1,
      share: async () =>
        (await cards()).renderStatCard({
          year,
          bg: data.persona.field,
          fg: data.persona.thread,
          kicker: "O meu perfil de ouvinte é",
          value: data.persona.name,
          caption: data.persona.tagline,
          icon: data.persona.icon,
        }),
      render: () => <PersonaSlide data={data} />,
    },
    topArtist && {
      id: "top-artist",
      transition: "burst",
      accent: C.scarf,
      burstWord: "#1",
      duration: 19000,
      bg: C.ink,
      fg: C.cream,
      soundtrack: topArtist.soundtrackId,
      share: async () => {
        const banner = await fetchArtistBanner(topArtist.name).catch(() => null)
        return (await cards()).renderStatCard({
          year,
          bg: C.ink,
          fg: C.cream,
          kicker: `O meu artista de ${year}`,
          value: topArtist.name,
          caption: `${formatNumber(topArtist.plays)} reproduções.`,
          imageUrl: banner ?? coverUrl(topArtist.soundtrackId),
          imageShape: banner ? "banner" : "square",
        })
      },
      render: () => <TopArtistSlide data={data} />,
    },
    data.topArtists.length >= 2 && {
      id: "top-artists",
      share: list({
        year,
        bg: C.ember,
        fg: C.ink,
        kicker: `Os meus artistas de ${year}`,
        items: data.topArtists.map((a) => a.name),
      }),
      transition: "slash",
      accent: C.cream,
      duration: 15000,
      bg: C.ember,
      fg: C.ink,
      soundtrack: topArtist?.soundtrackId,
      render: () => <TopArtistsSlide data={data} />,
    },
    songs[0] && {
      id: "top-song",
      transition: "zoom",
      accent: C.scarf,
      duration: 20000,
      bg: C.maroonDeep,
      fg: C.scarf,
      soundtrack: s1,
      share: async () =>
        (await cards()).renderStatCard({
          year,
          bg: C.maroonDeep,
          fg: C.scarf,
          kicker: `A minha música de ${year}`,
          value: songs[0]!.title,
          caption: `${songs[0]!.artist ? `${songs[0]!.artist}. ` : ""}Ouvi-a ${formatNumber(songs[0]!.plays)} vezes.`,
          imageUrl: coverUrl(s1),
        }),
      render: () => <TopSongSlide data={data} />,
    },
    songs.length >= 2 && {
      id: "top-songs",
      share: list({
        year,
        bg: C.scarf,
        fg: C.maroon,
        kicker: `As minhas músicas de ${year}`,
        items: songs.map((s) => s.title),
        imageUrl: coverUrl(s1),
      }),
      transition: "wipe",
      accent: C.ember,
      duration: 16000,
      bg: C.scarf,
      fg: C.maroon,
      soundtrack: s2,
      render: () => <TopSongsSlide data={data} />,
    },
    data.catalogShare !== null && {
      id: "discoveries",
      share: stat({
        year,
        bg: C.pine,
        fg: C.sky,
        kicker: "Do catálogo do ScoutBangers, ouvi",
        value: `${Math.round((data.catalogShare ?? 0) * 100)}%`,
        caption: `${formatNumber(raw.unique_songs)} músicas diferentes de ${formatNumber(raw.unique_artists)} artistas.`,
      }),
      transition: "iris",
      accent: C.forest,
      duration: 15000,
      bg: C.pine,
      fg: C.sky,
      soundtrack: s2,
      render: () => <DiscoveriesSlide data={data} />,
    },
    (raw.regiao_rank || raw.agrupamento_rank) && {
      id: "scouts",
      share: stat({
        year,
        bg: C.maroon,
        fg: C.cream,
        kicker: raw.agrupamento_rank
          ? `No Agrupamento ${raw.agrupamento_rank.numero} sou o ouvinte`
          : `Na região de ${raw.regiao_rank?.name ?? ""} sou o ouvinte`,
        value: `nº ${(raw.agrupamento_rank ?? raw.regiao_rank)?.rank ?? ""}`,
        caption: `de ${formatNumber((raw.agrupamento_rank ?? raw.regiao_rank)?.size ?? 0)} ouvintes.`,
      }),
      transition: "flip",
      accent: C.scarf,
      duration: 15000,
      bg: C.maroon,
      fg: C.cream,
      soundtrack: data.communityTopSong?.id ?? s1,
      render: () => <ScoutGroupSlide data={data} />,
    },
    raw.badges && raw.badges.gold + raw.badges.silver + raw.badges.bronze > 0 && {
      id: "medals",
      share: stat({
        year,
        bg: C.forest,
        fg: C.cream,
        kicker: "No pódio dos ouvintes da semana",
        value: `${raw.badges.gold + raw.badges.silver + raw.badges.bronze}×`,
        caption: `${raw.badges.gold}× 1.º lugar, ${raw.badges.silver}× 2.º lugar, ${raw.badges.bronze}× 3.º lugar.`,
      }),
      transition: "bubbles",
      accent: C.scarf,
      duration: 14000,
      bg: C.forest,
      fg: C.cream,
      soundtrack: data.communityTopSong?.id ?? s1,
      render: () => <MedalsSlide data={data} />,
    },
    // ---- ScoutBangers' own year ----
    ...(raw.community && raw.community.total_plays > 0
      ? [
          {
            id: "app-intro",
            share: stat({
              year,
              bg: C.ink,
              fg: C.scarf,
              kicker: "O ano do ScoutBangers",
              value: String(year),
              caption: `${formatNumber(raw.community.total_plays)} músicas tocadas por ${formatNumber(raw.community.listeners)} ouvintes.`,
            }),
            transition: "burst",
            burstWord: "E NÓS?",
            duration: 12000,
            bg: C.ink,
            fg: C.scarf,
            accent: C.maroon,
            soundtrack: data.app.topSongs[0]?.song.id ?? data.communityTopSong?.id ?? s1,
            render: () => <AppIntroSlide year={year} />,
          } satisfies SlideDef,
          // The app on its first day vs today — only in the year it started.
          year === Number(WRAPPED_ORIGINS.firstDay.slice(0, 4)) &&
            ({
              id: "app-origins",
              share: stat({
                year,
                bg: C.maroon,
                fg: C.cream,
                kicker: "Foi assim que o ScoutBangers começou",
                value: formatDay(new Date(`${WRAPPED_ORIGINS.firstDay}T12:00:00`)),
                caption: `${WRAPPED_ORIGINS.songsOnDayOne} músicas e um botão de play. Hoje somos muito mais.`,
                imageUrl: WRAPPED_ORIGINS.before,
                imageShape: "portrait",
              }),
              transition: "flip",
              duration: 17000,
              bg: C.maroon,
              fg: C.cream,
              accent: C.scarf,
              soundtrack: data.app.topSongs[0]?.song.id ?? s1,
              render: () => <AppOriginsSlide data={data} />,
            } satisfies SlideDef),
          // Growth and monthly plays need the newer RPC fields (0042 re-run);
          // without them these slides are left out rather than showing zeros.
          raw.community.users_total !== undefined &&
            data.app.usersEnd > 0 && ({
            id: "app-growth",
            share: stat({
              year,
              bg: C.sky,
              fg: C.maroonDeep,
              kicker: `Em ${year} o ScoutBangers chegou a`,
              value: `${formatNumber(data.app.usersEnd)} escuteiros`,
              caption: `${formatNumber(data.app.usersEnd - data.app.usersStart)} contas novas este ano.`,
            }),
            transition: "blinds",
            duration: 16000,
            bg: C.sky,
            fg: C.maroonDeep,
            accent: C.scarf,
            soundtrack: data.app.topSongs[0]?.song.id ?? s1,
            render: () => <AppGrowthSlide data={data} />,
          } satisfies SlideDef),
          raw.community.by_month !== undefined && ({
            id: "app-plays",
            share: stat({
              year,
              bg: C.maroon,
              fg: C.cream,
              kicker: `Em ${year}, no ScoutBangers, tocámos`,
              value: formatNumber(raw.community.total_plays),
              caption: `músicas. ${formatNumber(Math.round(raw.community.total_seconds / 3600))} horas de bangers.`,
            }),
            transition: "wipe",
            duration: 16000,
            bg: C.maroon,
            fg: C.cream,
            accent: C.ember,
            soundtrack: data.app.topSongs[1]?.song.id ?? data.app.topSongs[0]?.song.id ?? s1,
            render: () => <AppPlaysSlide data={data} />,
          } satisfies SlideDef),
          data.app.songsAdded > 0 &&
            ({
              id: "app-catalog",
              share: stat({
                year,
                bg: C.scarf,
                fg: C.ink,
                kicker: `Em ${year} entraram no ScoutBangers`,
                value: `${formatNumber(data.app.songsAdded)} músicas`,
                caption: `O catálogo tem agora ${formatNumber(data.app.catalogSize)} músicas.`,
              }),
              transition: "slash",
              duration: 15000,
              bg: C.scarf,
              fg: C.ink,
              accent: C.maroon,
              soundtrack: data.app.topSongs[1]?.song.id ?? s1,
              render: () => <AppCatalogSlide data={data} />,
            } satisfies SlideDef),
          data.app.topSongs.length >= 3 &&
            ({
              id: "app-top",
              share: list({
                year,
                bg: C.forest,
                fg: C.cream,
                kicker: `O top da malta em ${year}`,
                items: data.app.topSongs.map((t) => t.song.title),
                imageUrl: coverUrl(data.app.topSongs[0]?.song.id),
              }),
              transition: "iris",
              duration: 17000,
              bg: C.forest,
              fg: C.cream,
              accent: C.scarf,
              soundtrack: data.app.topSongs[0]?.song.id,
              render: () => <AppTopSlide data={data} />,
            } satisfies SlideDef),
        ]
      : []),
    {
      id: "summary",
      transition: "zoom",
      accent: C.scarf,
      duration: 24000,
      bg: C.maroon,
      fg: C.cream,
      soundtrack: s1,
      share: async () =>
        (await cards()).renderSummaryCard({
          year,
          bg: C.maroon,
          fg: C.cream,
          accent: C.scarf,
          name: who.name,
          avatarUrl: who.avatarUrl,
          coverUrl: coverUrl(s1),
          minutes: data.minutes,
          persona: data.persona.name,
          topArtists: data.topArtists.map((a) => a.name),
          topSongs: songs.map((s) => s.title),
        }),
      render: () => <SummarySlide data={data} name={who.name} avatarUrl={who.avatarUrl} />,
    },
    // The finale: the author's thank-you to everyone.
    {
      id: "thanks",
      transition: "bubbles",
      accent: C.ember,
      duration: 30000,
      bg: C.ink,
      fg: C.cream,
      soundtrack: data.app.topSongs[0]?.song.id ?? s1,
      render: () => <ThanksSlide />,
    },
  ]
  return slides.filter((s): s is SlideDef => Boolean(s))
}
