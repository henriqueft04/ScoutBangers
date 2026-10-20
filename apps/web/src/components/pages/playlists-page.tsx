import * as React from "react"
import { Globe, Loader2, Lock, Plus, Trash2, Users } from "lucide-react"
import { useSearchParams } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { SignInDialog } from "@/components/auth/sign-in-dialog"
import { ConfirmDialog } from "@/components/profile/confirm-dialog"
import { EmptyState } from "@/components/library/empty-state"
import { DiscoverPlaylists } from "@/components/playlists/discover-playlists"
import { PlaylistInvites } from "@/components/playlists/playlist-invites"
import { PlaylistRow } from "@/components/playlists/playlist-row"
import { SavedPlaylistsSection } from "@/components/playlists/saved-playlists-section"
import { useAuth } from "@/hooks/useAuth"
import { myPlaylistsOverview } from "@/lib/playlist-saves"
import { getCached, getStaleCached, setCached } from "@/lib/storage"
import { supabase } from "@/lib/supabase"

interface PlaylistRow {
  id: string
  name: string
  is_public: boolean
  created_at: string
  song_count: number
  save_count: number
  cover_url: string | null
  preview_song_ids: string[]
  // Missing in caches written before collaborators existed.
  owner_name?: string
  is_collaborator?: boolean
}

const CACHE_TTL_MS = 5 * 60 * 1000
const playlistsCacheKey = (userId: string) => `scoutbangers:playlists:${userId}`

/**
 * Lists the signed-in user's playlists. Sign-in CTA when anonymous.
 * Each row links to /playlists/:id where the songs live and can be played.
 *
 * Stale-while-revalidate, same pattern as useSongs(): the last-fetched list
 * is cached in localStorage so re-opening the page (including offline)
 * shows it immediately instead of an empty/loading state, while a fresh
 * fetch runs in the background whenever there's a connection.
 */
export function PlaylistsPage() {
  const { user, loading: authLoading } = useAuth()
  const [playlists, setPlaylists] = React.useState<PlaylistRow[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [signInOpen, setSignInOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get("tab") === "descobrir" ? "descobrir" : "minhas"
  const setTab = (next: "minhas" | "descobrir") =>
    setSearchParams(next === "minhas" ? {} : { tab: next }, { replace: true })

  // Hydrate from cache the moment we know who the user is — before the
  // network fetch below even starts. Prefer fresh cache, fall back to
  // stale (ignores TTL) so the list still appears when reopened offline
  // well past the 5-minute window.
  React.useEffect(() => {
    if (!user) return
    const key = playlistsCacheKey(user.id)
    const cached =
      getCached<PlaylistRow[]>(key) ?? getStaleCached<PlaylistRow[]>(key)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setPlaylists(cached)
  }, [user])

  const reload = React.useCallback(async () => {
    if (!supabase || !user) return
    setLoading(true)
    setError(null)
    const overview = await myPlaylistsOverview(user.id)
    if (!overview) {
      setLoading(false)
      // Keep showing whatever's cached rather than blanking the page —
      // only surface the error when there's truly nothing to fall back
      // to (e.g. first-ever visit while offline).
      const key = playlistsCacheKey(user.id)
      const hasFallback = Boolean(
        getCached<PlaylistRow[]>(key) ?? getStaleCached<PlaylistRow[]>(key)
      )
      setError(hasFallback ? null : "Não foi possível carregar as playlists.")
      return
    }
    const rows: PlaylistRow[] = overview.map((row) => ({
      id: row.id,
      name: row.name,
      is_public: row.isPublic,
      created_at: row.createdAt,
      song_count: row.songCount,
      save_count: row.saveCount,
      cover_url: row.coverUrl,
      preview_song_ids: row.previewSongIds,
      owner_name: row.ownerName,
      is_collaborator: row.isCollaborator,
    }))

    setPlaylists(rows)
    setCached(playlistsCacheKey(user.id), rows, CACHE_TTL_MS)
    setLoading(false)
  }, [user])

  React.useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [user, reload])

  const [pendingDelete, setPendingDelete] = React.useState<{
    id: string
    name: string
  } | null>(null)

  const handleDelete = (event: React.MouseEvent, id: string, name: string) => {
    event.preventDefault()
    event.stopPropagation()
    setPendingDelete({ id, name })
  }

  const performDelete = async (id: string) => {
    setPendingDelete(null)
    if (!supabase || !user) return
    const { error } = await supabase.from("playlists").delete().eq("id", id)
    if (error) {
      setError(error.message)
      return
    }
    const next = playlists ? playlists.filter((p) => p.id !== id) : playlists
    setPlaylists(next)
    // Keep the cache in sync with the deletion — otherwise a stale cache
    // read (e.g. the app goes offline right after this) would bring the
    // just-deleted playlist back.
    if (next) setCached(playlistsCacheKey(user.id), next, CACHE_TTL_MS)
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase || !user || !newName.trim()) return
    // New playlists default to private. Owner can flip to public
    // from the detail page if they want it shared.
    const { error } = await supabase
      .from("playlists")
      .insert({ user_id: user.id, name: newName.trim(), is_public: false })
    if (error) {
      setError(error.message)
      return
    }
    setNewName("")
    setCreating(false)
    void reload()
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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 pt-6 md:px-6">
        <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
          Playlists
        </h2>
        <EmptyState
          variant="empty"
          message="Inicia sessão para criar e guardar playlists."
        />
        <Button
          type="button"
          className="self-start"
          onClick={() => setSignInOpen(true)}
        >
          Iniciar sessão
        </Button>
        <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pt-3 pb-4 md:px-6 md:pt-4">
      <header className="flex items-center justify-between">
        <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
          Playlists
        </h2>
        {tab === "minhas" ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setCreating((open) => !open)}
          >
            <Plus className="size-4" />
            Nova
          </Button>
        ) : null}
      </header>

      <div role="tablist" className="border-border flex gap-4 border-b">
        {(
          [
            ["minhas", "As minhas"],
            ["descobrir", "Descobrir"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
              tab === value
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "descobrir" ? (
        <DiscoverPlaylists />
      ) : (
        <>
          {creating ? (
            <form
              onSubmit={handleCreate}
              className="border-border bg-card flex items-center gap-2 rounded-md border p-2"
            >
              <input
                autoFocus
                type="text"
                placeholder="Nome da playlist"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className="border-input bg-background focus-visible:ring-ring/40 flex-1 rounded-md border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
              />
              <Button type="submit" size="sm" disabled={!newName.trim()}>
                Criar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreating(false)
                  setNewName("")
                }}
              >
                Cancelar
              </Button>
            </form>
          ) : null}

          <PlaylistInvites onAccepted={() => void reload()} />

          {error && playlists && playlists.length > 0 ? (
            <p className="text-destructive text-xs">{error}</p>
          ) : null}

          {loading && !playlists ? (
            <EmptyState variant="loading" />
          ) : error && (!playlists || playlists.length === 0) ? (
            <EmptyState variant="error" message={error} />
          ) : !playlists || playlists.length === 0 ? (
            <EmptyState
              variant="empty"
              message="Ainda não tens playlists. Toca em Nova para criar a primeira."
            />
          ) : (
            <ul role="list" className="flex flex-col gap-1">
              {[...playlists]
                .sort(
                  (a, b) =>
                    Number(b.name === "Favorites") -
                    Number(a.name === "Favorites")
                )
                .map((playlist) => (
                  <li key={playlist.id}>
                    <PlaylistRow
                      id={playlist.id}
                      name={playlist.name}
                      ownerName={
                        playlist.is_collaborator
                          ? playlist.owner_name
                          : undefined
                      }
                      songCount={playlist.song_count}
                      saveCount={playlist.is_public ? playlist.save_count : 0}
                      coverUrl={playlist.cover_url}
                      previewSongIds={playlist.preview_song_ids}
                      icon={
                        playlist.is_collaborator ? (
                          <Users
                            className="text-muted-foreground size-3.5 shrink-0"
                            aria-label="Colaborativa"
                          />
                        ) : playlist.is_public ? (
                          <Globe
                            className="text-muted-foreground size-3.5 shrink-0"
                            aria-label="Pública"
                          />
                        ) : (
                          <Lock
                            className="text-muted-foreground size-3.5 shrink-0"
                            aria-label="Privada"
                          />
                        )
                      }
                      action={
                        playlist.is_collaborator ? undefined : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Apagar ${playlist.name}`}
                            onClick={(event) =>
                              handleDelete(event, playlist.id, playlist.name)
                            }
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )
                      }
                    />
                  </li>
                ))}
            </ul>
          )}

          <SavedPlaylistsSection userId={user.id} />

          <ConfirmDialog
            open={pendingDelete !== null}
            title="Apagar playlist"
            description={`Apagar "${pendingDelete?.name ?? ""}"? Isto não se pode desfazer.`}
            confirmLabel="Apagar"
            destructive
            onCancel={() => setPendingDelete(null)}
            onConfirm={() =>
              pendingDelete && void performDelete(pendingDelete.id)
            }
          />
        </>
      )}
    </div>
  )
}
