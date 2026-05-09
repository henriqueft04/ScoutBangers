import * as React from "react"
import { ArrowLeft, Loader2, ListMusic } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { EmptyState } from "@/components/library/empty-state"
import { useAuth } from "@/hooks/useAuth"
import { usePlayer } from "@/hooks/usePlayer"
import { artistHref } from "@/lib/artists"
import { supabase, supabaseConfigured } from "@/lib/supabase"

interface PublicProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
  share_activity: boolean
}

interface TopSong {
  id: string
  title: string
  playCount: number
}
interface TopArtist {
  name: string
  playCount: number
}
interface PublicPlaylist {
  id: string
  name: string
  song_count: number
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
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
  const { songs } = usePlayer()
  const [profile, setProfile] = React.useState<PublicProfile | null>(null)
  const [topSongs, setTopSongs] = React.useState<TopSong[] | null>(null)
  const [topArtists, setTopArtists] = React.useState<TopArtist[] | null>(null)
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
        .select("id, display_name, avatar_url, created_at, share_activity")
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

      const [songsRes, artistsRes, playlistsRes] = await Promise.all([
        sb.rpc("top_songs_for_user", { uid: userId, lim: 5 }),
        sb.rpc("top_artists_for_user", { uid: userId, lim: 5 }),
        sb
          .from("playlists")
          .select("id, name")
          .eq("user_id", userId)
          .eq("is_public", true)
          .order("created_at", { ascending: false }),
      ])
      if (cancelled) return

      if (!songsRes.error && songsRes.data) {
        const byId = new Map(songs.map((s) => [s.id, s]))
        setTopSongs(
          songsRes.data
            .map((row) => {
              const song = byId.get(row.song_id)
              return song
                ? {
                    id: song.id,
                    title: song.title,
                    playCount: Number(row.play_count),
                  }
                : null
            })
            .filter((row): row is TopSong => row !== null)
        )
      } else {
        setTopSongs([])
      }

      if (!artistsRes.error && artistsRes.data) {
        setTopArtists(
          artistsRes.data.map((row) => ({
            name: row.artist,
            playCount: Number(row.play_count),
          }))
        )
      } else {
        setTopArtists([])
      }

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
  }, [userId, songs])

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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 pt-3 pb-4 md:px-6 md:pt-4">
      <button
        type="button"
        onClick={handleBack}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-start text-sm"
        aria-label="Voltar"
      >
        <ArrowLeft className="size-4" />
        Voltar
      </button>
      <section className="flex items-center gap-4">
        <div className="bg-primary text-primary-foreground flex size-20 items-center justify-center overflow-hidden rounded-full text-2xl font-semibold md:size-24">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="size-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
            {displayName}
          </h2>
          <p className="text-muted-foreground text-xs">
            Inscreveu-se a {formatDate(profile.created_at)}
          </p>
          {isSelf ? (
            <Link
              to="/profile"
              className="text-muted-foreground hover:text-foreground self-start text-xs underline"
            >
              Editar perfil
            </Link>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-muted-foreground text-xs uppercase tracking-wider">
          Top 5 músicas
        </h3>
        {topSongs === null ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : topSongs.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ainda não há reproduções.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {topSongs.map((song, index) => (
              <li
                key={song.id}
                className="flex items-baseline gap-3 text-sm"
              >
                <span className="text-muted-foreground w-5 tabular-nums">
                  {index + 1}
                </span>
                <span className="text-foreground flex-1 truncate">
                  {song.title}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {song.playCount}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-muted-foreground text-xs uppercase tracking-wider">
          Top 5 artistas
        </h3>
        {topArtists === null ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : topArtists.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Ainda não há reproduções de artistas.
          </p>
        ) : (
          <ol className="flex flex-col gap-1">
            {topArtists.map((artist, index) => (
              <li
                key={artist.name}
                className="flex items-baseline gap-3 text-sm"
              >
                <span className="text-muted-foreground w-5 tabular-nums">
                  {index + 1}
                </span>
                <Link
                  to={artistHref(artist.name)}
                  className="text-foreground hover:underline flex-1 truncate"
                >
                  {artist.name}
                </Link>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {artist.playCount}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

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
  )
}
