import * as React from "react"
import { ArrowLeft, BarChart3 } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { ActivityChart } from "@/components/stats/activity-chart"
import { BumpChart } from "@/components/stats/bump-chart"
import { ListenersByRegion } from "@/components/stats/listeners-by-region"
import { UsersByRegion } from "@/components/stats/users-by-region"
import { SummaryCards } from "@/components/stats/summary-cards"
import { TopArtists } from "@/components/stats/top-artists"
import { TopListeners } from "@/components/stats/top-listeners"
import { TopSongs } from "@/components/stats/top-songs"
import { usePlayer } from "@/hooks/usePlayer"
import {
  useListenersByRegion,
  usePlaysPerDay,
  useUsersByRegion,
  useStatsSummary,
  useTopArtists,
  useTopListeners,
  useTopSongs,
  useTopSongsWeekly,
  type StatsPeriod,
} from "@/hooks/useStats"
import { supabaseConfigured } from "@/lib/supabase"

const SUMMARY_PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mês" },
  { value: "all", label: "Sempre" },
]

const ARTIST_RANGES: { value: number | null; label: string }[] = [
  { value: 30, label: "Últimos 30 dias" },
  { value: null, label: "Sempre" },
]

/**
 * /estatisticas — group-wide listening stats. Aggregates everyone's plays
 * (registered + anonymous) for songs/artists/activity, but the "top
 * listeners" leaderboard only counts registered users who haven't
 * disabled `share_activity` on their profile.
 */
export function StatsPage() {
  const { songs } = usePlayer()
  const songsById = React.useMemo(
    () => new Map(songs.map((s) => [s.id, s])),
    [songs]
  )

  const [summaryPeriod, setSummaryPeriod] = React.useState<StatsPeriod>("week")
  const [songsPeriod, setSongsPeriod] = React.useState<StatsPeriod>("week")
  const [listenersPeriod, setListenersPeriod] =
    React.useState<StatsPeriod>("week")
  const [regionPeriod, setRegionPeriod] = React.useState<StatsPeriod>("week")
  const [artistRange, setArtistRange] = React.useState<number | null>(30)

  const summary = useStatsSummary(summaryPeriod)
  const topSongs = useTopSongs(songsPeriod, 10)
  const listeners = useTopListeners(listenersPeriod, 10)
  const artists = useTopArtists(artistRange, 10)
  const regions = useListenersByRegion(regionPeriod, 10)
  const usersByRegion = useUsersByRegion(10)
  const activity = usePlaysPerDay(30)
  const weeklySongs = useTopSongsWeekly(8)

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-10 text-center">
        <BarChart3 className="text-muted-foreground mx-auto size-10" />
        <h2 className="text-foreground text-xl font-semibold tracking-tight">
          Estatísticas indisponíveis
        </h2>
        <p className="text-muted-foreground text-sm">
          O Supabase não está configurado nesta instalação.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-3 pt-3 pb-10 md:px-6 md:pt-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground -ml-2 lg:hidden"
            aria-label="Voltar"
          >
            <Link to="/">
              <ArrowLeft />
            </Link>
          </Button>
          <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
            Estatísticas
          </h2>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          O que o grupo tem andado a ouvir. Os totais incluem reproduções
          anónimas; o ranking de ouvintes só conta utilizadores registados
          que partilham a sua atividade.
        </p>
      </header>

      <Section
        title="Resumo"
        toolbar={
          <SegmentedControl
            value={summaryPeriod}
            options={SUMMARY_PERIODS}
            onChange={setSummaryPeriod}
            ariaLabel="Período do resumo"
          />
        }
      >
        <SummaryCards
          data={summary.data}
          loading={summary.loading}
          period={summaryPeriod}
        />
      </Section>

      <Section
        title="Músicas mais ouvidas"
        toolbar={
          <SegmentedControl
            value={songsPeriod}
            options={SUMMARY_PERIODS}
            onChange={setSongsPeriod}
            ariaLabel="Período das músicas"
          />
        }
      >
        <TopSongs
          rows={topSongs.data}
          loading={topSongs.loading}
          songsById={songsById}
        />
      </Section>

      <Section
        title="Maiores ouvintes"
        toolbar={
          <SegmentedControl
            value={listenersPeriod}
            options={SUMMARY_PERIODS}
            onChange={setListenersPeriod}
            ariaLabel="Período dos ouvintes"
          />
        }
      >
        <TopListeners rows={listeners.data} loading={listeners.loading} />
      </Section>

      <Section
        title="Artistas mais ouvidos"
        toolbar={
          <SegmentedControl
            value={artistRange}
            options={ARTIST_RANGES}
            onChange={setArtistRange}
            ariaLabel="Período dos artistas"
          />
        }
      >
        <TopArtists rows={artists.data} loading={artists.loading} />
      </Section>

      <Section
        title="Regiões / Núcleos"
        toolbar={
          <SegmentedControl
            value={regionPeriod}
            options={SUMMARY_PERIODS}
            onChange={setRegionPeriod}
            ariaLabel="Período das regiões"
          />
        }
      >
        <ListenersByRegion rows={regions.data} loading={regions.loading} />
      </Section>

      <Section
        title="Utilizadores por região / núcleo"
        subtitle="Utilizadores registados com região definida no perfil."
      >
        <UsersByRegion rows={usersByRegion.data} loading={usersByRegion.loading} />
      </Section>

      <Section
        title="Atividade"
        subtitle="Reproduções por dia nos últimos 30 dias."
      >
        <ActivityChart rows={activity.data} loading={activity.loading} />
      </Section>

      <Section
        title="Top 10 ao longo do tempo"
        subtitle="Posição semanal das músicas mais ouvidas (últimas 8 semanas)."
      >
        <BumpChart
          rows={weeklySongs.data}
          loading={weeklySongs.loading}
          songsById={songsById}
        />
      </Section>
    </div>
  )
}

interface SectionProps {
  title: string
  subtitle?: string
  toolbar?: React.ReactNode
  children: React.ReactNode
}

function Section({ title, subtitle, toolbar, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-foreground text-lg font-semibold tracking-tight">
            {title}
          </h3>
          {subtitle ? (
            <p className="text-muted-foreground text-xs">{subtitle}</p>
          ) : null}
        </div>
        {toolbar}
      </div>
      {children}
    </section>
  )
}

interface SegmentedControlProps<T> {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  ariaLabel: string
}

function SegmentedControl<T extends string | number | null>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="border-border bg-card inline-flex rounded-md border p-0.5 text-xs"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition-colors touch-manipulation",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
