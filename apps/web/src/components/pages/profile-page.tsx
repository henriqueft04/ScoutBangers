import * as React from "react"
import { Loader2, LogOut } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { SignInDialog } from "@/components/auth/sign-in-dialog"
import { EmptyState } from "@/components/library/empty-state"
import { useAuth } from "@/hooks/useAuth"
import { usePlayer } from "@/hooks/usePlayer"
import { artistHref } from "@/lib/artists"
import { supabase, supabaseConfigured } from "@/lib/supabase"

interface TopSong {
  id: string
  title: string
  playCount: number
}
interface TopArtist {
  name: string
  playCount: number
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function ProfilePage() {
  const { user, profile, loading: authLoading, signOut } = useAuth()
  const { songs } = usePlayer()
  const [topSongs, setTopSongs] = React.useState<TopSong[] | null>(null)
  const [topArtists, setTopArtists] = React.useState<TopArtist[] | null>(null)
  const [signInOpen, setSignInOpen] = React.useState(false)

  React.useEffect(() => {
    if (!supabase || !user) return
    let cancelled = false

    const fetchStats = async () => {
      if (!supabase || !user) return
      const [songsRes, artistsRes] = await Promise.all([
        supabase.rpc("top_songs_for_user", { uid: user.id, lim: 5 }),
        supabase.rpc("top_artists_for_user", { uid: user.id, lim: 5 }),
      ])
      if (cancelled) return
      if (!songsRes.error && songsRes.data) {
        const byId = new Map(songs.map((s) => [s.id, s]))
        setTopSongs(
          songsRes.data
            .map((row) => {
              const song = byId.get(row.song_id)
              return song
                ? { id: song.id, title: song.title, playCount: Number(row.play_count) }
                : null
            })
            .filter((row): row is TopSong => row !== null)
        )
      }
      if (!artistsRes.error && artistsRes.data) {
        setTopArtists(
          artistsRes.data.map((row) => ({
            name: row.artist,
            playCount: Number(row.play_count),
          }))
        )
      }
    }

    void fetchStats()

    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchStats()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [user, songs])

  if (authLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 pt-6 md:px-6">
        <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 pt-6 md:px-6">
        <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
          Profile
        </h2>
        <EmptyState
          variant="empty"
          message={
            supabaseConfigured
              ? "Sign in to see your stats and favorites."
              : "Authentication isn't set up yet."
          }
        />
        {supabaseConfigured ? (
          <Button
            type="button"
            className="self-start"
            onClick={() => setSignInOpen(true)}
          >
            Sign in
          </Button>
        ) : null}
        <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
      </div>
    )
  }

  const displayName =
    profile?.display_name ??
    user.user_metadata?.name ??
    user.email?.split("@")[0] ??
    "Listener"
  const avatarUrl = profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null
  const joined = formatDate(user.created_at)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 pt-3 pb-4 md:px-6 md:pt-4">
      <section className="flex items-center gap-4">
        <div className="bg-primary text-primary-foreground flex size-20 items-center justify-center overflow-hidden rounded-full text-2xl font-semibold md:size-24">
          {avatarUrl ? (
            <img
              src={avatarUrl}
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
          <p className="text-muted-foreground text-xs">Joined {joined}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground self-start px-0"
          >
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-muted-foreground text-xs uppercase tracking-wider">
          Top 5 songs
        </h3>
        {topSongs === null ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : topSongs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing yet — listen to some songs to see your top tracks.
          </p>
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
          Top 5 artists
        </h3>
        {topArtists === null ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : topArtists.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No artist plays recorded yet.
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
    </div>
  )
}
