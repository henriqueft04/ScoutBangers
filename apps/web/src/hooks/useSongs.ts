import * as React from "react"

import { fetchSongs } from "@/lib/api"
import { getCached, setCached } from "@/lib/storage"
import type { Song } from "@/lib/types"

const CACHE_KEY = "scoutbangers:songs"
const CACHE_TTL_MS = 5 * 60 * 1000

interface UseSongsResult {
  songs: Song[]
  loading: boolean
  error: string | null
  reload: () => void
}

interface State {
  songs: Song[]
  loading: boolean
  error: string | null
}

/**
 * Stale-while-revalidate hook around `/api/songs`. On mount it serves any
 * cached manifest immediately (so the UI is never empty on a warm visit) while
 * fetching a fresh copy in the background. Cache TTL is 5 minutes.
 *
 * `reload()` busts both the local cache and the serverless edge cache.
 */
export function useSongs(): UseSongsResult {
  const [state, setState] = React.useState<State>(() => {
    const cached = getCached<Song[]>(CACHE_KEY)
    return {
      songs: cached ?? [],
      loading: cached === null,
      error: null,
    }
  })

  // We need to trigger refetches imperatively (mount + reload). A counter
  // ticked by `reload` is the simplest "command" channel that doesn't require
  // calling setState from inside the effect's body.
  const [bustToken, setBustToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    fetchSongs({ bust: bustToken > 0 })
      .then((fresh) => {
        if (cancelled) return
        setCached(CACHE_KEY, fresh, CACHE_TTL_MS)
        setState({ songs: fresh, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState((prev) => ({
          songs: prev.songs,
          loading: false,
          error: error instanceof Error ? error.message : "Erro desconhecido",
        }))
      })
    return () => {
      cancelled = true
    }
  }, [bustToken])

  const reload = React.useCallback(() => {
    setBustToken((n) => n + 1)
  }, [])

  return {
    songs: state.songs,
    loading: state.loading,
    error: state.error,
    reload,
  }
}
