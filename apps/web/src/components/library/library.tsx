import { useFilteredSongs } from "@/hooks/useFilteredSongs"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { usePlayer } from "@/hooks/usePlayer"

import { EmptyState } from "./empty-state"
import { SearchInput } from "./search-input"
import { SongList } from "./song-list"
import { SortSelect } from "./sort-select"

/**
 * The library view: search input + filtered song list. State is read directly
 * from {@link usePlayer}, so no props are needed.
 */
export function Library() {
  const {
    songs,
    search,
    setSearch,
    play,
    currentIndex,
    isPlaying,
    loading,
    error,
  } = usePlayer()

  const debouncedSearch = useDebouncedValue(search, 120)
  const filtered = useFilteredSongs(songs, debouncedSearch)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pt-3 pb-4 md:px-6 md:pt-4">
      <div className="flex items-center gap-2">
        <SearchInput value={search} onChange={setSearch} className="flex-1" />
        <SortSelect />
      </div>

      {loading && songs.length === 0 ? (
        <EmptyState variant="loading" />
      ) : error && songs.length === 0 ? (
        <EmptyState variant="error" message={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          variant="empty"
          message={
            search
              ? `No songs match "${search}".`
              : "Drop some MP3s into the Drive folder and refresh."
          }
        />
      ) : (
        <SongList
          songs={filtered}
          currentIndex={
            currentIndex !== null
              ? filtered.findIndex((song) => song.id === songs[currentIndex]?.id)
              : null
          }
          isPlaying={isPlaying}
          onPlay={(filteredIndex) => {
            const song = filtered[filteredIndex]
            if (!song) return
            const indexInAll = songs.findIndex((s) => s.id === song.id)
            if (indexInAll !== -1) play(indexInAll)
          }}
        />
      )}
    </div>
  )
}
