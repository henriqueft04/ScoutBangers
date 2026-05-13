import * as React from "react"
import { ArrowLeft, Loader2, ListMusic } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { EmptyState } from "@/components/library/empty-state"
import { ProfileHeader } from "@/components/profile/profile-header"
import { TopList } from "@/components/profile/top-list"
import { useAuth } from "@/hooks/useAuth"
import { useTopStats } from "@/hooks/useTopStats"
import { artistHref } from "@/lib/artists"
import { formatJoinDate } from "@/lib/format-date"
import { supabase, supabaseConfigured } from "@/lib/supabase"

interface PublicProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  banner_url: string | null
  created_at: string
  share_activity: boolean
  regiao: string | null
  nucleo: string | null
  agrupamento_numero: number | null
  agrupamento_nome: string | null
}

interface PublicPlaylist {
  id: string
  name: string
  song_count: number
}

/**
 * Public-facing profile at /u/:userId. Anyone (signed in or not) can
 * view a user's avatar, name, join date, top stats, and any playlists
 * they've marked public.
 *
 * Distinct from /profile (the personal view) which has the privacy
 * toggle and sign-out controls. Visiting /u/:myId shows the same
 * read-only view a friend would see.
 */
export function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const handleBack = React.useCallback(() => {
    // Prefer browser-back so users land on whatever they came from
    // (a friends-feed click, a search result, etc). Fall back to the
    // home page when there's no history entry to pop.
    if (window.history.length > 1) navigate(-1)
    else navigate("/")
  }, [navigate])
  const { topSongs, topArtists } = useTopStats(userId ?? null)
  const [profile, setProfile] = React.useState<PublicProfile | null>(null)
  const [playlists, setPlaylists] = React.useState<PublicPlaylist[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    void (async () => {
      const sb = supabase!
      const profileRes = await sb
        .from("profiles")
        .select(
          "id, display_name, avatar_url, banner_url, created_at, share_activity, regiao, nucleo, agrupamento_numero, agrupamento_nome"
        )
        .eq("id", userId)
        .maybeSingle()
      if (cancelled) return
      if (profileRes.error) {
        setError(profileRes.error.message)
        setLoading(false)
        return
      }
      if (!profileRes.data) {
        setError("Este perfil não existe.")
        setLoading(false)
        return
      }
      setProfile(profileRes.data)

      const playlistsRes = await sb
        .from("playlists")
        .select("id, name")
        .eq("user_id", userId)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
      if (cancelled) return

      if (!playlistsRes.error && playlistsRes.data) {
        const lists = playlistsRes.data
        const ids = lists.map((p) => p.id)
        const counts = new Map<string, number>()
        if (ids.length > 0) {
          const { data: rows } = await sb
            .from("playlist_songs")
            .select("playlist_id")
            .in("playlist_id", ids)
          if (rows) {
            for (const r of rows) {
              counts.set(r.playlist_id, (counts.get(r.playlist_id) ?? 0) + 1)
            }
          }
        }
        setPlaylists(
          lists.map((p) => ({
            id: p.id,
            name: p.name,
            song_count: counts.get(p.id) ?? 0,
          }))
        )
      } else {
        setPlaylists([])
      }

      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [userId])

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 pt-6 md:px-6">
        <EmptyState
          variant="empty"
          message="Os perfis estão indisponíveis — o Supabase não está configurado."
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 pt-6 md:px-6">
        <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 pt-6 md:px-6">
        <EmptyState variant="error" message={error ?? "Perfil não encontrado."} />
      </div>
    )
  }

  const displayName = profile.display_name ?? "Ouvinte"
  const isSelf = user?.id === profile.id

  return (
    <div className="mx-auto w-full max-w-3xl pb-4">
      <ProfileHeader
        displayName={displayName}
        avatarUrl={profile.avatar_url}
        bannerUrl={profile.banner_url}
        regiao={profile.regiao}
        nucleo={profile.nucleo}
        agrupamentoNumero={profile.agrupamento_numero}
        agrupamentoNome={profile.agrupamento_nome}
        subtitle={`Inscreveu-se a ${formatJoinDate(profile.created_at)}`}
        topLeftSlot={
          <button
            type="button"
            onClick={handleBack}
            className="bg-card/90 text-foreground hover:bg-card inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm shadow-sm backdrop-blur"
            aria-label="Voltar"
          >
            <ArrowLeft className="size-4" />
            Voltar
          </button>
        }
        bottomSlot={
          isSelf ? (
            <Link
              to="/profile"
              className="text-muted-foreground hover:text-foreground text-xs underline"
            >
              Editar perfil
            </Link>
          ) : null
        }
      />

      <div className="flex flex-col gap-6 px-3 pt-6 md:px-6">
      <TopList
        title="Top 5 músicas"
        items={
          topSongs?.map((song) => ({
            id: song.id,
            label: song.title,
            count: song.playCount,
          })) ?? null
        }
        emptyMessage="Ainda não há reproduções."
      />

      <TopList
        title="Top 5 artistas"
        items={
          topArtists?.map((artist) => ({
            id: artist.name,
            label: artist.name,
            count: artist.playCount,
            href: artistHref(artist.name),
          })) ?? null
        }
        emptyMessage="Ainda não há reproduções de artistas."
      />

      <section className="flex flex-col gap-2">
        <h3 className="text-muted-foreground text-xs uppercase tracking-wider">
          Playlists públicas
        </h3>
        {playlists === null ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : playlists.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Ainda não há playlists públicas.
          </p>
        ) : (
          <ul role="list" className="flex flex-col gap-1">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <Link
                  to={`/playlists/${playlist.id}`}
                  className="hover:bg-accent/40 flex items-center justify-between rounded-md px-3 py-2.5 transition-colors"
                >
                  <span className="text-foreground flex items-center gap-2 text-sm font-medium">
                    <ListMusic className="text-muted-foreground size-4" />
                    {playlist.name}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {playlist.song_count}{" "}
                    {playlist.song_count === 1 ? "música" : "músicas"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  )
}
