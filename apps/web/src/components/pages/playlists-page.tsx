import * as React from "react"
import { Globe, Loader2, Lock, Plus, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { SignInDialog } from "@/components/auth/sign-in-dialog"
import { EmptyState } from "@/components/library/empty-state"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/lib/supabase"

interface PlaylistRow {
  id: string
  name: string
  is_public: boolean
  created_at: string
  song_count: number
}

/**
 * Lists the signed-in user's playlists. Sign-in CTA when anonymous.
 * Each row links to /playlists/:id where the songs live and can be played.
 */
export function PlaylistsPage() {
  const { user, loading: authLoading } = useAuth()
  const [playlists, setPlaylists] = React.useState<PlaylistRow[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [signInOpen, setSignInOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState("")

  const reload = React.useCallback(async () => {
    if (!supabase || !user) return
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from("playlists")
      .select("id, name, is_public, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    const rows: PlaylistRow[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      is_public: row.is_public,
      created_at: row.created_at,
      song_count: 0,
    }))

    // Fetch song counts in a single query, then merge.
    if (rows.length > 0) {
      const { data: counts } = await supabase
        .from("playlist_songs")
        .select("playlist_id")
        .in("playlist_id", rows.map((r) => r.id))
      if (counts) {
        const tally = new Map<string, number>()
        for (const c of counts) {
          tally.set(c.playlist_id, (tally.get(c.playlist_id) ?? 0) + 1)
        }
        for (const row of rows) {
          row.song_count = tally.get(row.id) ?? 0
        }
      }
    }

    setPlaylists(rows)
    setLoading(false)
  }, [user])

  React.useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [user, reload])

  const handleDelete = async (
    event: React.MouseEvent,
    id: string,
    name: string
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (!supabase || !user) return
    if (!window.confirm(`Delete playlist "${name}"? This can't be undone.`)) {
      return
    }
    const { error } = await supabase.from("playlists").delete().eq("id", id)
    if (error) {
      setError(error.message)
      return
    }
    setPlaylists((prev) => (prev ? prev.filter((p) => p.id !== id) : prev))
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase || !user || !newName.trim()) return
    const { error } = await supabase
      .from("playlists")
      .insert({ user_id: user.id, name: newName.trim() })
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
          message="Sign in to create and save playlists."
        />
        <Button
          type="button"
          className="self-start"
          onClick={() => setSignInOpen(true)}
        >
          Sign in
        </Button>
        <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pt-3 pb-4 md:px-6 md:pt-4">
      <header className="flex items-center justify-between">
        <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
          Your playlists
        </h2>
        <Button
          type="button"
          size="sm"
          onClick={() => setCreating((open) => !open)}
        >
          <Plus className="size-4" />
          New
        </Button>
      </header>

      {creating ? (
        <form
          onSubmit={handleCreate}
          className="border-border bg-card flex items-center gap-2 rounded-md border p-2"
        >
          <input
            autoFocus
            type="text"
            placeholder="Playlist name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className="border-input bg-background focus-visible:ring-ring/40 flex-1 rounded-md border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <Button type="submit" size="sm" disabled={!newName.trim()}>
            Create
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
            Cancel
          </Button>
        </form>
      ) : null}

      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : null}

      {loading && !playlists ? (
        <EmptyState variant="loading" />
      ) : !playlists || playlists.length === 0 ? (
        <EmptyState
          variant="empty"
          message="No playlists yet. Tap New to make your first one."
        />
      ) : (
        <ul role="list" className="flex flex-col gap-1">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <div className="hover:bg-accent/40 flex items-center gap-2 rounded-md pr-1 transition-colors">
                <Link
                  to={`/playlists/${playlist.id}`}
                  className="flex flex-1 items-center justify-between gap-2 px-3 py-2.5"
                >
                  <span className="text-foreground flex min-w-0 items-center gap-2 text-sm font-medium">
                    {playlist.is_public ? (
                      <Globe
                        className="text-muted-foreground size-3.5 shrink-0"
                        aria-label="Public"
                      />
                    ) : (
                      <Lock
                        className="text-muted-foreground size-3.5 shrink-0"
                        aria-label="Private"
                      />
                    )}
                    <span className="truncate">{playlist.name}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {playlist.song_count}{" "}
                    {playlist.song_count === 1 ? "song" : "songs"}
                  </span>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${playlist.name}`}
                  onClick={(event) =>
                    handleDelete(event, playlist.id, playlist.name)
                  }
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
