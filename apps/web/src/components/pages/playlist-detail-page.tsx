import * as React from "react"
import { Globe, Link2, ListPlus, Loader2, Lock, Trash2 } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { EmptyState } from "@/components/library/empty-state"
import { SongList } from "@/components/library/song-list"
import { PlaylistSaveButton } from "@/components/playlists/playlist-save-button"
import { useAuth } from "@/hooks/useAuth"
import { usePlayFromList } from "@/hooks/usePlayFromList"
import { usePlayer } from "@/hooks/usePlayer"
import { shareUrl } from "@/lib/share"
import { supabase } from "@/lib/supabase"

interface PlaylistDetail {
  id: string
  name: string
  is_public: boolean
  is_owner: boolean
  owner_id: string
  song_ids: string[]
}

export function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()
  const { songs, currentIndex, isPlaying, queueAddMany } = usePlayer()
  const playFromList = usePlayFromList()
  const [playlist, setPlaylist] = React.useState<PlaylistDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [linkCopied, setLinkCopied] = React.useState(false)

  React.useEffect(() => {
    if (!supabase || !id) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    void (async () => {
      const [{ data: meta, error: metaErr }, { data: items, error: itemsErr }] =
        await Promise.all([
          supabase
            .from("playlists")
            .select("id, name, is_public, user_id")
            .eq("id", id)
            .single(),
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
        is_public: meta.is_public,
        is_owner: meta.user_id === user?.id,
        owner_id: meta.user_id,
        song_ids: (items ?? []).map((row) => row.song_id),
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user, id])

  const handleCopyLink = async () => {
    if (!playlist) return
    const url = `${window.location.origin}/playlists/${playlist.id}`
    const outcome = await shareUrl(playlist.name, url)
    if (outcome === "copied") {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    }
  }

  // Allow owner to flip is_public.
  const togglePublic = async () => {
    if (!supabase || !playlist || !playlist.is_owner) return
    const next = !playlist.is_public
    setPlaylist((prev) => (prev ? { ...prev, is_public: next } : prev))
    const { error } = await supabase
      .from("playlists")
      .update({ is_public: next })
      .eq("id", playlist.id)
    if (error) {
      // Roll back on failure.
      setPlaylist((prev) =>
        prev ? { ...prev, is_public: !next } : prev
      )
      setError(error.message)
    }
  }

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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pt-3 pb-4 md:px-6 md:pt-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
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
        <div className="flex shrink-0 items-center gap-1.5">
          {playlist && playlistSongs.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Adicionar playlist à fila"
              onClick={() => queueAddMany(playlist.song_ids)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ListPlus className="size-4" />
              Fila
            </Button>
          ) : null}
          {playlist?.is_public ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={linkCopied ? "Link copiado" : "Copiar link"}
              onClick={handleCopyLink}
              className="text-muted-foreground hover:text-foreground"
            >
              <Link2 className="size-4" />
              {linkCopied ? "Copiado" : "Partilhar"}
            </Button>
          ) : null}
          {playlist ? (
            <PlaylistSaveButton
              playlistId={playlist.id}
              ownerId={playlist.owner_id}
              isPublic={playlist.is_public}
            />
          ) : null}
          {playlist?.is_owner ? (
            <button
              type="button"
              onClick={togglePublic}
              aria-label={
                playlist.is_public
                  ? "Tornar playlist privada"
                  : "Tornar playlist pública"
              }
              aria-pressed={playlist.is_public}
              className={cn(
                "border-border inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                playlist.is_public
                  ? "text-primary border-primary/30 bg-primary/5"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {playlist.is_public ? (
                <Globe className="size-3.5" />
              ) : (
                <Lock className="size-3.5" />
              )}
              {playlist.is_public ? "Pública" : "Privada"}
            </button>
          ) : null}
        </div>
      </header>

      {loading ? (
        <EmptyState variant="loading" />
      ) : error ? (
        <EmptyState variant="error" message={error} />
      ) : playlistSongs.length === 0 ? (
        <EmptyState
          variant="empty"
          message="Esta playlist está vazia. Adiciona músicas da biblioteca ou do top 10."
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
              if (song) playFromList(song, playlistSongs)
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
                  aria-label={`Remover ${song.title}`}
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
