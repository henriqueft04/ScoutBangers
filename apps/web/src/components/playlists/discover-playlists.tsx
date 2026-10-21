import * as React from "react"
import { Globe, Loader2, Search } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { EmptyState } from "@/components/library/empty-state"
import { PlaylistRow } from "@/components/playlists/playlist-row"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import {
  DISCOVER_PAGE_SIZE,
  discoverPlaylists,
  type DiscoverPlaylist,
  type DiscoverSort,
} from "@/lib/playlist-saves"
import { getCached, setCached } from "@/lib/storage"

const CACHE_TTL_MS = 2 * 60 * 1000
const cacheKey = (sort: DiscoverSort) => `scoutbangers:discover:${sort}`

const SORTS: { value: DiscoverSort; label: string }[] = [
  { value: "saves", label: "Mais guardadas" },
  { value: "recent", label: "Recentes" },
]

/**
 * Other people's public playlists. Searchable by playlist or owner name,
 * sortable by save count. The first page of the un-searched list is cached
 * so the tab opens instantly.
 */
export function DiscoverPlaylists() {
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<DiscoverSort>("saves")
  const debounced = useDebouncedValue(query, 300)
  const [items, setItems] = React.useState<DiscoverPlaylist[] | null>(null)
  const [page, setPage] = React.useState(0)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)
  // Guards against out-of-order responses when the query changes quickly.
  const requestRef = React.useRef(0)

  const q = debounced.trim()

  React.useEffect(() => {
    const request = ++requestRef.current
    const cacheable = q === ""
    const cached = cacheable ? getCached<DiscoverPlaylist[]>(cacheKey(sort)) : null
    /* eslint-disable react-hooks/set-state-in-effect */
    setItems(cached)
    setPage(0)
    setHasMore(cached ? cached.length === DISCOVER_PAGE_SIZE : false)
    setError(false)
    setLoading(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    void discoverPlaylists({ q, sort, page: 0 }).then((rows) => {
      if (request !== requestRef.current) return
      setLoading(false)
      if (!rows) {
        setError(true)
        return
      }
      setItems(rows)
      setHasMore(rows.length === DISCOVER_PAGE_SIZE)
      if (cacheable) setCached(cacheKey(sort), rows, CACHE_TTL_MS)
    })
  }, [q, sort])

  const loadMore = async () => {
    const request = requestRef.current
    const next = page + 1
    setLoading(true)
    const rows = await discoverPlaylists({ q, sort, page: next })
    if (request !== requestRef.current) return
    setLoading(false)
    if (!rows) return
    setItems((prev) => [...(prev ?? []), ...rows])
    setPage(next)
    setHasMore(rows.length === DISCOVER_PAGE_SIZE)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar playlists ou pessoas"
          className="border-input bg-background focus-visible:ring-ring/40 w-full rounded-md border py-2 pr-3 pl-9 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
      </div>

      <div className="flex gap-1.5" role="group" aria-label="Ordenar">
        {SORTS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={sort === option.value}
            onClick={() => setSort(option.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              sort === option.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {items === null && loading ? (
        <EmptyState variant="loading" />
      ) : error && (!items || items.length === 0) ? (
        <EmptyState variant="error" message="Não foi possível carregar as playlists." />
      ) : !items || items.length === 0 ? (
        <EmptyState
          variant="empty"
          message={
            q
              ? "Nenhuma playlist encontrada."
              : "Ainda não há playlists públicas de outras pessoas."
          }
        />
      ) : (
        <ul role="list" className="flex flex-col gap-1">
          {items.map((playlist) => (
            <li key={playlist.id}>
              <PlaylistRow
                id={playlist.id}
                name={playlist.name}
                ownerName={playlist.ownerDisplayName}
                songCount={playlist.songCount}
                saveCount={playlist.saveCount}
                coverUrl={playlist.coverUrl}
                previewSongIds={playlist.previewSongIds}
                icon={<Globe className="text-muted-foreground size-3.5 shrink-0" />}
              />
            </li>
          ))}
        </ul>
      )}

      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          disabled={loading}
          onClick={() => void loadMore()}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Ver mais"}
        </Button>
      ) : null}
    </div>
  )
}
