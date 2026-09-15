import * as React from "react"
import {
  Check,
  CloudDownload,
  Globe,
  Link2,
  ListPlus,
  Loader2,
  Lock,
  Trash2,
} from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { CellularDownloadDialog } from "@/components/library/cellular-download-dialog"
import { EmptyState } from "@/components/library/empty-state"
import { OfflineDownloadProgressBar } from "@/components/library/offline-download-progress"
import { SongList } from "@/components/library/song-list"
import { PlaylistSaveButton } from "@/components/playlists/playlist-save-button"
import { useAuth } from "@/hooks/useAuth"
import { useOfflineDownload } from "@/hooks/useOfflineDownload"
import { usePlayFromList } from "@/hooks/usePlayFromList"
import { usePlayer } from "@/hooks/usePlayer"
import { formatBytes } from "@/lib/format"
import { shareUrl } from "@/lib/share"
import { getCached, getStaleCached, setCached } from "@/lib/storage"
import { supabase } from "@/lib/supabase"

interface PlaylistDetail {
  id: string
  name: string
  is_public: boolean
  is_owner: boolean
  owner_id: string
  song_ids: string[]
}

/** What actually gets cached — `is_owner` is derived from the current
 *  user at read time, not a property of the playlist itself. */
type CachedPlaylistMeta = Omit<PlaylistDetail, "is_owner">

function toCachedMeta(detail: PlaylistDetail): CachedPlaylistMeta {
  return {
    id: detail.id,
    name: detail.name,
    is_public: detail.is_public,
    owner_id: detail.owner_id,
    song_ids: detail.song_ids,
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000
const playlistDetailCacheKey = (id: string) => `scoutbangers:playlist:${id}`

export function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()
  const { songs, currentIndex, isPlaying, queueAddMany } = usePlayer()
  const playFromList = usePlayFromList()
  const [playlist, setPlaylist] = React.useState<PlaylistDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [linkCopied, setLinkCopied] = React.useState(false)

  // Hydrate from cache immediately (including offline) whenever the
  // target playlist changes, before the network fetch below resolves.
  // Prefer fresh cache, fall back to stale so a playlist visited before
  // still opens well after the 5-minute TTL.
  React.useEffect(() => {
    if (!id) return
    const key = playlistDetailCacheKey(id)
    const cached = getCached<CachedPlaylistMeta>(key) ?? getStaleCached<CachedPlaylistMeta>(key)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setPlaylist({ ...cached, is_owner: cached.owner_id === user?.id })
  }, [id, user])

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
      // Checked as two separate `if`s (not combined into one `metaErr ??
      // itemsErr` variable) so TypeScript can actually narrow `meta` to
      // non-null below — through an intermediate variable it can't
      // connect "no error" back to "so `meta` must be populated".
      if (metaErr || itemsErr) {
        setLoading(false)
        // Keep showing whatever's cached (already applied above) rather
        // than blanking the page — only surface the error when there's
        // nothing to fall back to.
        const key = playlistDetailCacheKey(id)
        const hasFallback = Boolean(
          getCached<CachedPlaylistMeta>(key) ?? getStaleCached<CachedPlaylistMeta>(key)
        )
        setError(hasFallback ? null : (metaErr ?? itemsErr)!.message)
        return
      }
      const cacheable: CachedPlaylistMeta = {
        id: meta.id,
        name: meta.name,
        is_public: meta.is_public,
        owner_id: meta.user_id,
        song_ids: (items ?? []).map((row) => row.song_id),
      }
      setPlaylist({ ...cacheable, is_owner: meta.user_id === user?.id })
      setCached(playlistDetailCacheKey(id), cacheable, CACHE_TTL_MS)
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
    const original = playlist
    const optimistic = { ...playlist, is_public: !playlist.is_public }
    setPlaylist(optimistic)
    const { error } = await supabase
      .from("playlists")
      .update({ is_public: optimistic.is_public })
      .eq("id", playlist.id)
    if (error) {
      setPlaylist(original)
      setError(error.message)
      return
    }
    setCached(playlistDetailCacheKey(optimistic.id), toCachedMeta(optimistic), CACHE_TTL_MS)
  }

  const playlistSongs = React.useMemo(() => {
    if (!playlist) return []
    const byId = new Map(songs.map((song) => [song.id, song]))
    return playlist.song_ids
      .map((sid) => byId.get(sid))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
  }, [playlist, songs])

  // Download this playlist's songs into the offline audio cache — the
  // same mechanism as the bulk Storage section, just scoped to this one
  // playlist. Works for any playlist the songs are visible from
  // (including someone else's public/saved playlist), not just ones this
  // user owns — the cache is per-device, not tied to ownership.
  const {
    targets: offlineTargets,
    targetBytes: offlineTargetBytes,
    downloading: offlineDownloading,
    error: offlineError,
    requestStart: requestOfflineDownload,
    confirmingCellular,
    confirmCellularDownload,
    cancelCellularConfirm,
    cancel: cancelOfflineDownload,
  } = useOfflineDownload(playlistSongs)
  const fullyOffline = playlistSongs.length > 0 && offlineTargets.length === 0

  const handleRemove = async (songId: string) => {
    if (!supabase || !playlist) return
    const { error: deleteError } = await supabase
      .from("playlist_songs")
      .delete()
      .eq("playlist_id", playlist.id)
      .eq("song_id", songId)
    // Only update local state (and the offline cache) once the delete is
    // actually confirmed — e.g. offline, this used to silently update the
    // UI as if it worked while the song stayed in the playlist server-side.
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    const next = {
      ...playlist,
      song_ids: playlist.song_ids.filter((s) => s !== songId),
    }
    setPlaylist(next)
    setCached(playlistDetailCacheKey(next.id), toCachedMeta(next), CACHE_TTL_MS)
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
          {playlist && playlistSongs.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={
                fullyOffline
                  ? "Playlist disponível offline"
                  : "Transferir playlist para offline"
              }
              onClick={requestOfflineDownload}
              disabled={Boolean(offlineDownloading) || fullyOffline}
              className={cn(
                "hover:text-foreground",
                fullyOffline ? "text-primary" : "text-muted-foreground"
              )}
            >
              {offlineDownloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : fullyOffline ? (
                <Check className="size-4" />
              ) : (
                <CloudDownload className="size-4" />
              )}
              {fullyOffline
                ? "Offline"
                : `Transferir (${formatBytes(offlineTargetBytes)})`}
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

      {offlineDownloading ? (
        <OfflineDownloadProgressBar
          progress={offlineDownloading}
          targetBytes={offlineTargetBytes}
          onCancel={cancelOfflineDownload}
        />
      ) : null}
      {offlineError ? (
        <p className="text-destructive text-xs">{offlineError}</p>
      ) : null}

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

      <CellularDownloadDialog
        open={confirmingCellular}
        targetBytes={offlineTargetBytes}
        onConfirm={confirmCellularDownload}
        onCancel={cancelCellularConfirm}
      />
    </div>
  )
}
