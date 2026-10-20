import * as React from "react"
import {
  ArrowLeft,
  Camera,
  Check,
  CloudDownload,
  Globe,
  ListPlus,
  Loader2,
  Lock,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Share2,
  Shuffle,
  Trash2,
} from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { CellularDownloadDialog } from "@/components/library/cellular-download-dialog"
import { EmptyState } from "@/components/library/empty-state"
import { OfflineDownloadProgressBar } from "@/components/library/offline-download-progress"
import { ImageCropper } from "@/components/profile/image-cropper"
import { UserAvatar } from "@/components/profile/user-avatar"
import { SongList } from "@/components/library/song-list"
import { AddSongsSheet } from "@/components/playlists/add-songs-sheet"
import { PlaylistCover } from "@/components/playlists/playlist-cover"
import { PlaylistSaveButton } from "@/components/playlists/playlist-save-button"
import { useAuth } from "@/hooks/useAuth"
import { useFavorites } from "@/hooks/useFavorites"
import { useOfflineDownload } from "@/hooks/useOfflineDownload"
import { usePlayFromList } from "@/hooks/usePlayFromList"
import { usePlayer } from "@/hooks/usePlayer"
import { usePlaylistSave } from "@/hooks/usePlaylistSave"
import {
  PLAYLIST_COVER_HEIGHT,
  PLAYLIST_COVER_WIDTH,
  deletePlaylistCover,
  uploadPlaylistCoverBlob,
} from "@/lib/avatar-upload"
import { formatBytes } from "@/lib/format"
import { shuffle } from "@/lib/shuffle"
import { shareUrl } from "@/lib/share"
import {
  getCached,
  getStaleCached,
  removeCached,
  setCached,
} from "@/lib/storage"
import { supabase } from "@/lib/supabase"

interface PlaylistDetail {
  id: string
  name: string
  is_public: boolean
  cover_url: string | null
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
    cover_url: detail.cover_url,
    owner_id: detail.owner_id,
    song_ids: detail.song_ids,
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000
const playlistDetailCacheKey = (id: string) => `scoutbangers:playlist:${id}`

function MenuItem({
  icon,
  children,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "hover:bg-accent/50 flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors disabled:opacity-60",
        destructive ? "text-destructive" : "text-foreground"
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function ChipButton({
  icon,
  children,
  onClick,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-secondary text-secondary-foreground hover:bg-secondary/80 inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors"
    >
      {icon}
      {children}
    </button>
  )
}

export function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id
  const { songs, currentIndex, isPlaying, queueAddMany, toggle } = usePlayer()
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
    if (cached)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaylist({
        ...cached,
        cover_url: cached.cover_url ?? null,
        is_owner: cached.owner_id === userId,
      })
  }, [id, userId])

  React.useEffect(() => {
    if (!supabase || !id) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    void (async () => {
      // One round trip (playlist + its songs embedded), retried once: a cold
      // or briefly unreachable Supabase shouldn't strand the page.
      const query = () =>
        supabase!
          .from("playlists")
          .select(
            "id, name, is_public, cover_url, user_id, playlist_songs(song_id, position)"
          )
          .eq("id", id)
          .order("position", { referencedTable: "playlist_songs" })
          .abortSignal(AbortSignal.timeout(10000))
          .single()
      let { data: row, error: rowErr } = await query()
      if (rowErr && !cancelled) ({ data: row, error: rowErr } = await query())
      if (cancelled) return
      if (rowErr || !row) {
        setLoading(false)
        // Keep showing whatever's cached (already applied above) rather
        // than blanking the page — only surface the error when there's
        // nothing to fall back to.
        const key = playlistDetailCacheKey(id)
        const hasFallback = Boolean(
          getCached<CachedPlaylistMeta>(key) ?? getStaleCached<CachedPlaylistMeta>(key)
        )
        setError(hasFallback ? null : (rowErr?.message ?? "Playlist não encontrada"))
        return
      }
      const cacheable: CachedPlaylistMeta = {
        id: row.id,
        name: row.name,
        is_public: row.is_public,
        cover_url: row.cover_url,
        owner_id: row.user_id,
        song_ids: row.playlist_songs.map((item) => item.song_id),
      }
      setPlaylist({ ...cacheable, is_owner: row.user_id === userId })
      setCached(playlistDetailCacheKey(id), cacheable, CACHE_TTL_MS)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [userId, id])

  // Author's name for the line under the title. Not part of the cached
  // playlist meta; a missing name just hides the line.
  const ownerId = playlist?.owner_id
  const [owner, setOwner] = React.useState<{
    id: string
    name: string
    avatarUrl: string | null
  } | null>(null)
  React.useEffect(() => {
    if (!supabase || !ownerId) return
    let cancelled = false
    void supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", ownerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.display_name) {
          setOwner({
            id: ownerId,
            name: data.display_name,
            avatarUrl: data.avatar_url,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [ownerId])

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

  const { count: saveCount } = usePlaylistSave(playlist?.id)

  // The deck is "on this playlist" when the current song belongs to it.
  const currentSongId = currentIndex !== null ? songs[currentIndex]?.id : null
  const playingHere = Boolean(
    isPlaying &&
      currentSongId &&
      playlistSongs.some((song) => song.id === currentSongId)
  )
  const handlePlay = () => {
    if (playingHere) {
      toggle()
      return
    }
    const first = playlistSongs[0]
    if (first) playFromList(first, playlistSongs)
  }
  const handleShuffle = () => {
    // Play a pre-shuffled copy so the order is random from the first song.
    const order = shuffle(playlistSongs)
    const first = order[0]
    if (first) playFromList(first, order)
  }

  const [addOpen, setAddOpen] = React.useState(false)
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!menuOpen) return
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !menuRef.current?.contains(event.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", close)
    return () => {
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", close)
    }
  }, [menuOpen])
  const [renaming, setRenaming] = React.useState(false)
  const [draftName, setDraftName] = React.useState("")
  const { toggle: toggleFavorite } = useFavorites()
  const isFavoritesList = playlist?.name === "Favorites"

  const setSongIds = (next: PlaylistDetail) => {
    setPlaylist(next)
    setCached(playlistDetailCacheKey(next.id), toCachedMeta(next), CACHE_TTL_MS)
  }

  const handleAdd = async (songId: string) => {
    if (!supabase || !playlist) return
    if (isFavoritesList) {
      // Goes through useFavorites so hearts elsewhere stay in sync.
      await toggleFavorite(songId)
    } else {
      const { error: insertError } = await supabase
        .from("playlist_songs")
        .insert({
          playlist_id: playlist.id,
          song_id: songId,
          position: Math.floor(Date.now() / 1000),
        })
      if (insertError) {
        setError(insertError.message)
        return
      }
    }
    setSongIds({ ...playlist, song_ids: [...playlist.song_ids, songId] })
  }

  const coverInputRef = React.useRef<HTMLInputElement>(null)
  const [pendingCover, setPendingCover] = React.useState<File | null>(null)
  const [coverBusy, setCoverBusy] = React.useState(false)
  const [coverError, setCoverError] = React.useState<string | null>(null)

  const persistCover = async (url: string | null) => {
    if (!supabase || !playlist) return
    const { error: coverError } = await supabase
      .from("playlists")
      .update({ cover_url: url })
      .eq("id", playlist.id)
    if (coverError) throw new Error(coverError.message)
    setSongIds({ ...playlist, cover_url: url })
  }

  const handleCoverConfirm = async (blob: Blob) => {
    if (!playlist) return
    setPendingCover(null)
    setCoverBusy(true)
    setCoverError(null)
    try {
      const url = await uploadPlaylistCoverBlob(blob, playlist.id)
      await persistCover(url)
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "Não foi possível guardar a capa.")
    } finally {
      setCoverBusy(false)
    }
  }

  const handleCoverRemove = async () => {
    if (!playlist) return
    setCoverBusy(true)
    try {
      await persistCover(null)
      await deletePlaylistCover(playlist.id).catch(() => undefined)
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "Não foi possível remover a capa.")
    } finally {
      setCoverBusy(false)
    }
  }

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault()
    const name = draftName.trim()
    if (!supabase || !playlist || !name) return
    if (name === playlist.name) {
      setRenaming(false)
      return
    }
    const { error: renameError } = await supabase
      .from("playlists")
      .update({ name })
      .eq("id", playlist.id)
    if (renameError) {
      setError(renameError.message)
      return
    }
    setSongIds({ ...playlist, name })
    // The list page caches names too — drop it so it refetches.
    if (userId) removeCached(`scoutbangers:playlists:${userId}`)
    setRenaming(false)
  }

  const handleDelete = async () => {
    if (!supabase || !playlist) return
    if (
      !window.confirm(
        `Apagar a playlist "${playlist.name}"? Isto não se pode desfazer.`
      )
    ) {
      return
    }
    const { error: deleteError } = await supabase
      .from("playlists")
      .delete()
      .eq("id", playlist.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    removeCached(playlistDetailCacheKey(playlist.id))
    if (userId) removeCached(`scoutbangers:playlists:${userId}`)
    navigate("/playlists", { replace: true })
  }

  const handleRemove = async (songId: string) => {
    if (!supabase || !playlist) return
    if (isFavoritesList) {
      await toggleFavorite(songId)
      setSongIds({
        ...playlist,
        song_ids: playlist.song_ids.filter((s) => s !== songId),
      })
      return
    }
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
      <header className="flex flex-col gap-4">
        <Link
          to="/playlists"
          aria-label="Voltar às playlists"
          className="text-foreground hover:bg-accent/50 -ml-1.5 inline-flex size-9 items-center justify-center self-start rounded-full transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>

        <div className="relative">
          <PlaylistCover
            songs={playlistSongs}
            coverUrl={playlist?.cover_url}
            seed={playlist?.id}
            className="rounded-lg"
          />
          {playlist?.is_owner ? (
            <>
              <button
                type="button"
                aria-label="Editar capa da playlist"
                disabled={coverBusy}
                onClick={() => coverInputRef.current?.click()}
                className="bg-background/80 text-foreground hover:bg-background absolute right-3 bottom-3 inline-flex size-10 items-center justify-center rounded-full shadow-md backdrop-blur-sm transition-colors disabled:opacity-60"
              >
                {coverBusy ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Camera className="size-5" />
                )}
              </button>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (file) setPendingCover(file)
                }}
              />
            </>
          ) : null}
        </div>
        {coverError ? (
          <p className="text-destructive text-xs" role="alert">
            {coverError}
          </p>
        ) : null}

        <div className="min-w-0">
          {renaming ? (
            <form onSubmit={handleRename} className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={draftName}
                maxLength={80}
                onChange={(event) => setDraftName(event.target.value)}
                aria-label="Nome da playlist"
                className="border-input bg-background focus-visible:ring-ring/40 min-w-0 flex-1 rounded-md border px-3 py-1.5 text-base focus-visible:ring-2 focus-visible:outline-none"
              />
              <Button type="submit" size="sm" disabled={!draftName.trim()}>
                Guardar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setRenaming(false)}
              >
                Cancelar
              </Button>
            </form>
          ) : (
            <h2 className="text-foreground text-2xl font-bold tracking-tight break-words md:text-3xl">
              {playlist?.name ?? "Playlist"}
            </h2>
          )}
          {playlist && owner?.id === playlist.owner_id ? (
            <Link
              to={playlist.is_owner ? "/profile" : `/u/${playlist.owner_id}`}
              className="mt-2 inline-flex max-w-full items-center gap-2"
            >
              <UserAvatar
                name={owner.name}
                avatarUrl={owner.avatarUrl}
                className="size-6"
              />
              <span className="text-foreground truncate text-sm font-semibold hover:underline">
                {owner.name}
              </span>
            </Link>
          ) : null}
          {playlist ? (
            <p className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-sm">
              {playlist.is_public ? (
                <Globe className="size-3.5 shrink-0" />
              ) : (
                <Lock className="size-3.5 shrink-0" />
              )}
              <span className="truncate">
                {[
                  playlist.is_public ? null : "Privada",
                  playlist.is_public && saveCount > 0
                    ? `Guardada por ${saveCount}`
                    : null,
                  `${playlist.song_ids.length} ${
                    playlist.song_ids.length === 1 ? "música" : "músicas"
                  }`,
                ]
                  .filter(Boolean)
                  .join(" • ")}
              </span>
            </p>
          ) : null}
        </div>

        {playlist ? (
          <>
            <div className="flex items-center gap-1">
              {playlistSongs.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={
                    fullyOffline
                      ? "Playlist disponível offline"
                      : `Transferir playlist (${formatBytes(offlineTargetBytes)})`
                  }
                  onClick={requestOfflineDownload}
                  disabled={Boolean(offlineDownloading) || fullyOffline}
                  className={cn(
                    "text-muted-foreground hover:text-foreground",
                    fullyOffline && "text-primary"
                  )}
                >
                  {offlineDownloading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : fullyOffline ? (
                    <Check className="size-5" />
                  ) : (
                    <CloudDownload className="size-5" />
                  )}
                </Button>
              ) : null}
              {playlist.is_public ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={linkCopied ? "Link copiado" : "Partilhar playlist"}
                  onClick={handleCopyLink}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {linkCopied ? (
                    <Check className="size-5" />
                  ) : (
                    <Share2 className="size-5" />
                  )}
                </Button>
              ) : null}

              <div ref={menuRef} className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Mais opções"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <MoreVertical className="size-5" />
                </Button>
                {menuOpen ? (
                  <div
                    role="menu"
                    className="bg-card border-border absolute left-0 z-20 mt-1 flex w-56 flex-col rounded-lg border p-1 shadow-lg"
                  >
                    {playlistSongs.length > 0 ? (
                      <MenuItem
                        icon={<ListPlus className="size-4" />}
                        onClick={() => {
                          queueAddMany(playlist.song_ids)
                          setMenuOpen(false)
                        }}
                      >
                        Adicionar à fila
                      </MenuItem>
                    ) : null}
                    {playlist.is_owner && playlist.cover_url ? (
                      <MenuItem
                        icon={<Camera className="size-4" />}
                        onClick={() => {
                          setMenuOpen(false)
                          void handleCoverRemove()
                        }}
                      >
                        Remover capa
                      </MenuItem>
                    ) : null}
                    {playlist.is_owner && !isFavoritesList ? (
                      <MenuItem
                        destructive
                        icon={<Trash2 className="size-4" />}
                        onClick={() => {
                          setMenuOpen(false)
                          void handleDelete()
                        }}
                      >
                        Apagar playlist
                      </MenuItem>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {playlistSongs.length > 0 ? (
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Reprodução aleatória"
                    onClick={handleShuffle}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Shuffle className="size-5" />
                  </Button>
                  <button
                    type="button"
                    aria-label={playingHere ? "Pausar" : "Reproduzir playlist"}
                    onClick={handlePlay}
                    className="bg-primary text-primary-foreground focus-visible:ring-ring/40 inline-flex size-14 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {playingHere ? (
                      <Pause className="size-6 fill-current" />
                    ) : (
                      <Play className="size-6 translate-x-0.5 fill-current" />
                    )}
                  </button>
                </div>
              ) : null}
            </div>

            {playlist.is_owner || playlist.is_public ? (
              <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
                {playlist.is_owner ? (
                  <>
                    <ChipButton
                      icon={<Plus className="size-4" />}
                      onClick={() => setAddOpen(true)}
                    >
                      Adicionar
                    </ChipButton>
                    {!isFavoritesList ? (
                      <ChipButton
                        icon={<Pencil className="size-4" />}
                        onClick={() => {
                          setDraftName(playlist.name)
                          setRenaming(true)
                        }}
                      >
                        Renomear
                      </ChipButton>
                    ) : null}
                    {!isFavoritesList ? (
                      <ChipButton
                        icon={
                          playlist.is_public ? (
                            <Globe className="size-4" />
                          ) : (
                            <Lock className="size-4" />
                          )
                        }
                        onClick={togglePublic}
                      >
                        {playlist.is_public ? "Pública" : "Privada"}
                      </ChipButton>
                    ) : null}
                  </>
                ) : null}
                <PlaylistSaveButton
                  playlistId={playlist.id}
                  ownerId={playlist.owner_id}
                  isPublic={playlist.is_public}
                />
              </div>
            ) : null}
          </>
        ) : null}
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

      {loading && !playlist ? (
        <EmptyState variant="loading" />
      ) : error ? (
        <EmptyState variant="error" message={error} />
      ) : playlistSongs.length === 0 ? (
        <EmptyState
          variant="empty"
          message={
            playlist?.is_owner
              ? "Esta playlist está vazia. Toca em Adicionar músicas para começar."
              : "Esta playlist está vazia."
          }
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
        </div>
      )}

      {pendingCover ? (
        <ImageCropper
          file={pendingCover}
          title="Ajustar capa da playlist"
          aspect={PLAYLIST_COVER_WIDTH / PLAYLIST_COVER_HEIGHT}
          outputWidth={PLAYLIST_COVER_WIDTH}
          onCancel={() => setPendingCover(null)}
          onConfirm={handleCoverConfirm}
        />
      ) : null}

      {playlist?.is_owner ? (
        <AddSongsSheet
          open={addOpen}
          songs={songs}
          songIds={playlist.song_ids}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onClose={() => setAddOpen(false)}
        />
      ) : null}

      <CellularDownloadDialog
        open={confirmingCellular}
        targetBytes={offlineTargetBytes}
        onConfirm={confirmCellularDownload}
        onCancel={cancelCellularConfirm}
      />
    </div>
  )
}
