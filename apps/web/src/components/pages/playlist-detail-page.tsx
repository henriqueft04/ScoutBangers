import * as React from "react"
import { Loader2, Trash2 } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { EmptyState } from "@/components/library/empty-state"
import { SongList } from "@/components/library/song-list"
import { useAuth } from "@/hooks/useAuth"
import { usePlayer } from "@/hooks/usePlayer"
import { supabase } from "@/lib/supabase"

interface PlaylistDetail {
  id: string
  name: string
  song_ids: string[]
}

export function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()
  const { songs, currentIndex, isPlaying, play } = usePlayer()
  const [playlist, setPlaylist] = React.useState<PlaylistDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!supabase || !user || !id) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    void (async () => {
      const [{ data: meta, error: metaErr }, { data: items, error: itemsErr }] =
        await Promise.all([
          supabase.from("playlists").select("id, name").eq("id", id).single(),
          supabase
            .from("playlist_songs")
            .select("song_id, position")
            .eq("playlist_id", id)
            .order("position"),
        ])
      if (cancelled) return
      if (metaErr) {
        setError(metaErr.message)
        setLoading(false)
        return
      }
      if (itemsErr) {
        setError(itemsErr.message)
        setLoading(false)
        return
      }
      setPlaylist({
        id: meta.id,
        name: meta.name,
        song_ids: (items ?? []).map((row) => row.song_id),
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user, id])

  const playlistSongs = React.useMemo(() => {
    if (!playlist) return []
    const byId = new Map(songs.map((song) => [song.id, song]))
    return playlist.song_ids
      .map((sid) => byId.get(sid))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
  }, [playlist, songs])

  const handleRemove = async (songId: string) => {
    if (!supabase || !playlist) return
    await supabase
      .from("playlist_songs")
      .delete()
      .eq("playlist_id", playlist.id)
      .eq("song_id", songId)
    setPlaylist((prev) =>
      prev
        ? { ...prev, song_ids: prev.song_ids.filter((s) => s !== songId) }
        : prev
    )
  }

  if (authLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 pt-6 md:px-6">
        <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 pt-6 md:px-6">
        <EmptyState variant="empty" message="Sign in to view this playlist." />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pt-3 pb-4 md:px-6 md:pt-4">
      <header className="flex items-center justify-between">
        <div>
          <Link
            to="/playlists"
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            ← Playlists
          </Link>
          <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
            {playlist?.name ?? "Playlist"}
          </h2>
        </div>
      </header>

      {loading ? (
        <EmptyState variant="loading" />
      ) : error ? (
        <EmptyState variant="error" message={error} />
      ) : playlistSongs.length === 0 ? (
        <EmptyState
          variant="empty"
          message="This playlist is empty. Add songs from the library or top-10."
        />
      ) : (
        <div className="flex flex-col gap-1">
          <SongList
            songs={playlistSongs}
            currentIndex={
              currentIndex !== null
                ? playlistSongs.findIndex(
                    (s) => s.id === songs[currentIndex]?.id
                  )
                : null
            }
            isPlaying={isPlaying}
            onPlay={(idx) => {
              const song = playlistSongs[idx]
              if (!song) return
              const indexInAll = songs.findIndex((s) => s.id === song.id)
              if (indexInAll !== -1) play(indexInAll)
            }}
          />
          <ul className="mt-4 flex flex-col gap-1">
            {playlistSongs.map((song) => (
              <li
                key={`remove-${song.id}`}
                className="text-muted-foreground hidden items-center justify-between text-xs"
              >
                <span className="truncate">{song.title}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${song.title}`}
                  onClick={() => handleRemove(song.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
