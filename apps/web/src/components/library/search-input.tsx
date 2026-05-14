import * as React from "react"
import { Clock, Play, Search, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import { usePlayer } from "@/hooks/usePlayer"
import {
  clearSearchHistory,
  getSearchHistory,
  rememberSearch,
  removeSearch,
  type SearchHistoryEntry,
} from "@/lib/search-history"

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

/**
 * Library search field. Shows a dropdown of recent queries when the
 * input is focused with no current value. Recording happens on blur
 * with a non-empty value, so a query only enters history after the
 * user has actually used it.
 */
export function SearchInput({ value, onChange, className }: SearchInputProps) {
  const { songs, play } = usePlayer()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [focused, setFocused] = React.useState(false)
  const [history, setHistory] = React.useState<SearchHistoryEntry[]>([])

  const refreshHistory = React.useCallback(() => {
    setHistory(getSearchHistory())
  }, [])

  const handleClear = () => {
    onChange("")
    inputRef.current?.focus()
  }

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    // Don't blur if focus is moving inside the dropdown — let the
    // user click an entry without losing the panel first.
    const next = event.relatedTarget as Node | null
    if (next && containerRef.current?.contains(next)) return
    setFocused(false)
    if (value.trim().length > 0) {
      rememberSearch(value)
    }
  }

  const handlePick = (entry: SearchHistoryEntry) => {
    setFocused(false)
    inputRef.current?.blur()
    // If the entry has a song attached, play it directly. The song
    // may have been removed from the library since (file deleted on
    // Drive); fall back to re-applying the query in that case.
    if (entry.song) {
      const idx = songs.findIndex((s) => s.id === entry.song!.id)
      if (idx !== -1) {
        play(idx)
        rememberSearch(entry.query, entry.song)
        return
      }
    }
    onChange(entry.query)
    rememberSearch(entry.query)
  }

  const handleRemove = (query: string) => {
    removeSearch(query)
    refreshHistory()
    inputRef.current?.focus()
  }

  const handleClearAll = () => {
    clearSearchHistory()
    refreshHistory()
    inputRef.current?.focus()
  }

  const showDropdown = focused && value.length === 0 && history.length > 0

  return (
    <div
      ref={containerRef}
      data-tour-id="library-search"
      className={cn("relative", className)}
    >
      <Search
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        ref={inputRef}
        type="search"
        inputMode="search"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label="Pesquisar músicas"
        placeholder="Pesquisa por título ou artista…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          setFocused(true)
          refreshHistory()
        }}
        onBlur={handleBlur}
        className="h-10 px-9 text-sm md:h-9"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Limpar pesquisa"
          onClick={handleClear}
          className="absolute top-1/2 right-1 -translate-y-1/2 touch-manipulation"
        >
          <X />
        </Button>
      )}

      {showDropdown ? (
        <div
          role="listbox"
          aria-label="Pesquisas recentes"
          className="bg-card text-card-foreground border-border absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border shadow-lg"
        >
          <div className="border-border flex items-center justify-between border-b px-3 py-1.5">
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              Pesquisas recentes
            </span>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleClearAll}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Limpar
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {history.map((entry) => {
              const Icon = entry.song ? Play : Clock
              return (
                <li key={entry.query} className="flex items-center">
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handlePick(entry)}
                    className="text-foreground hover:bg-muted/60 flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        entry.song ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    <span className="flex min-w-0 flex-col">
                      {entry.song ? (
                        <>
                          <span className="truncate">
                            {entry.song.artist
                              ? `${entry.song.artist} – ${entry.song.title}`
                              : entry.song.title}
                          </span>
                          <span className="text-muted-foreground truncate text-xs">
                            Pesquisa: {entry.query}
                          </span>
                        </>
                      ) : (
                        <span className="truncate">{entry.query}</span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover "${entry.query}"`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleRemove(entry.query)}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted/60 mr-1 rounded-md p-1.5"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
