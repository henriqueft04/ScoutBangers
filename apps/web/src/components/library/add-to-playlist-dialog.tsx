import * as React from "react"
import { Check, HeartOff, ListPlus, Loader2, Plus, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { useAuth } from "@/hooks/useAuth"
import { useFavorites } from "@/hooks/useFavorites"
import { supabase } from "@/lib/supabase"

interface PlaylistSummary {
  id: string
  name: string
  alreadyContains: boolean
}

interface AddToPlaylistDialogProps {
  open: boolean
  songId: string
  onClose: () => void
}

const FAVORITES_PLAYLIST_NAME = "Favorites"

/**
 * Modal that opens when a user clicks the heart on an already-favorited
 * song. Lets them add the song to one of their other playlists, or
 * remove it from Favorites outright. Loads playlists lazily on open and
 * marks the ones that already contain this song so the user can see the
 * current state.
 */
export function AddToPlaylistDialog({
  open,
  songId,
  onClose,
}: AddToPlaylistDialogProps) {
  const { user } = useAuth()
  const { toggle: toggleFavorite } = useFavorites()
  const [playlists, setPlaylists] = React.useState<PlaylistSummary[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [creatingBusy, setCreatingBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open || !supabase || !user) return
    let cancelled = false

    void (async () => {
      const sb = supabase!
      // Fetch all of the user's playlists except Favorites.
      const { data: lists, error: listsErr } = await sb
        .from("playlists")
        .select("id, name")
        .eq("user_id", user.id)
        .neq("name", FAVORITES_PLAYLIST_NAME)
        .order("created_at", { ascending: false })
      if (cancelled) return
      if (listsErr) {
        setError(listsErr.message)
        return
      }
      const ids = (lists ?? []).map((p) => p.id)
      // Find which of those playlists already contain this song.
      let contains = new Set<string>()
      if (ids.length > 0) {
        const { data: rows } = await sb
          .from("playlist_songs")
          .select("playlist_id")
          .in("playlist_id", ids)
          .eq("song_id", songId)
        contains = new Set((rows ?? []).map((r) => r.playlist_id))
      }
      if (cancelled) return
      setPlaylists(
        (lists ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          alreadyContains: contains.has(p.id),
        }))
      )
    })()

    return () => {
      cancelled = true
    }
  }, [open, user, songId])

  React.useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  const handleAddTo = async (playlistId: string, alreadyContains: boolean) => {
    if (!supabase || alreadyContains) return
    setBusyId(playlistId)
    // eslint-disable-next-line react-hooks/purity
    const position = Math.floor(Date.now() / 1000)
    const { error } = await supabase.from("playlist_songs").insert({
      playlist_id: playlistId,
      song_id: songId,
      position,
    })
    setBusyId(null)
    if (error) {
      setError(error.message)
      return
    }
    setPlaylists((prev) =>
      prev
        ? prev.map((p) =>
            p.id === playlistId ? { ...p, alreadyContains: true } : p
          )
        : prev
    )
  }

  const handleRemoveFavorite = async () => {
    await toggleFavorite(songId)
    onClose()
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase || !user || !newName.trim()) return
    setCreatingBusy(true)
    setError(null)

    const name = newName.trim()
    // 1. Create the playlist
    const { data: created, error: createErr } = await supabase
      .from("playlists")
      .insert({ user_id: user.id, name })
      .select("id, name")
      .single()
    if (createErr || !created) {
      setError(createErr?.message ?? "Couldn't create playlist")
      setCreatingBusy(false)
      return
    }

    // 2. Add the song to it
    const position = Math.floor(Date.now() / 1000)
    const { error: addErr } = await supabase.from("playlist_songs").insert({
      playlist_id: created.id,
      song_id: songId,
      position,
    })
    if (addErr) {
      setError(addErr.message)
      setCreatingBusy(false)
      return
    }

    setPlaylists((prev) => [
      { id: created.id, name: created.name, alreadyContains: true },
      ...(prev ?? []),
    ])
    setNewName("")
    setCreating(false)
    setCreatingBusy(false)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add to playlist"
      className="bg-background/80 fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground border-border animate-in slide-in-from-bottom md:fade-in w-full max-w-md rounded-t-2xl border p-5 shadow-xl duration-200 ease-out md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">
            Add to playlist
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>

        {error ? (
          <p className="text-destructive mb-2 text-xs">{error}</p>
        ) : null}

        {creating ? (
          <form
            onSubmit={handleCreate}
            className="border-border bg-background mb-3 flex items-center gap-2 rounded-md border p-2"
          >
            <input
              autoFocus
              type="text"
              placeholder="Playlist name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              disabled={creatingBusy}
              className="flex-1 bg-transparent px-2 py-1 text-sm focus:outline-none"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!newName.trim() || creatingBusy}
            >
              {creatingBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Create"
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreating(false)
                setNewName("")
              }}
              disabled={creatingBusy}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="hover:bg-accent/40 mb-2 flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left transition-colors"
          >
            <Plus className="text-muted-foreground size-4" />
            <span className="text-foreground text-sm font-medium">
              New playlist
            </span>
          </button>
        )}

        <div className="mb-4 max-h-72 overflow-y-auto">
          {playlists === null ? (
            <Loader2 className="text-muted-foreground mx-auto my-4 size-5 animate-spin" />
          ) : playlists.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No other playlists yet. Create one from the Playlists tab.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {playlists.map((playlist) => (
                <li key={playlist.id}>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddTo(playlist.id, playlist.alreadyContains)
                    }
                    disabled={busyId === playlist.id || playlist.alreadyContains}
                    className="hover:bg-accent/40 disabled:hover:bg-transparent flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors"
                  >
                    <span className="text-foreground flex items-center gap-2 text-sm">
                      <ListPlus className="text-muted-foreground size-4" />
                      {playlist.name}
                    </span>
                    {playlist.alreadyContains ? (
                      <span className="text-primary inline-flex items-center gap-1 text-xs">
                        <Check className="size-3.5" />
                        Added
                      </span>
                    ) : busyId === playlist.id ? (
                      <Loader2 className="text-muted-foreground size-4 animate-spin" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          className="text-destructive w-full"
          onClick={handleRemoveFavorite}
        >
          <HeartOff className="size-4" />
          Remove from Favorites
        </Button>
      </div>
    </div>
  )
}
