import * as React from "react"
import { Loader2, Search, X } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { supabase, supabaseConfigured } from "@/lib/supabase"

interface PersonResult {
  id: string
  displayName: string
  avatarUrl: string | null
}

interface PeopleSearchProps {
  className?: string
}

/**
 * Search the `profiles` table by display name and surface matching users
 * as links to their public profile (`/u/:userId`). Shows a dropdown of
 * results while the field is focused with a non-empty query. Used in the
 * Friends section so people can look up friends by name.
 */
export function PeopleSearch({ className }: PeopleSearchProps) {
  const [query, setQuery] = React.useState("")
  const [focused, setFocused] = React.useState(false)
  const [results, setResults] = React.useState<PersonResult[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const debounced = useDebouncedValue(query.trim(), 250)

  React.useEffect(() => {
    if (!supabaseConfigured || !supabase || debounced.length === 0) {
      setResults(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      // `search_profiles` normalises both sides with `unaccent`, so the
      // match ignores diacritics (´ ` ~ ^ ç) — "joao" finds "João".
      const { data, error } = await supabase!.rpc("search_profiles", {
        q: debounced,
        lim: 12,
      })
      if (cancelled) return
      if (error) {
        setResults([])
        setLoading(false)
        return
      }
      setResults(
        (data ?? []).map((row) => ({
          id: row.id,
          displayName: row.display_name ?? "Ouvinte",
          avatarUrl: row.avatar_url,
        }))
      )
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [debounced])

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    // Keep the dropdown open if focus moves into it (clicking a result).
    const next = event.relatedTarget as Node | null
    if (next && containerRef.current?.contains(next)) return
    setFocused(false)
  }

  const handleClear = () => {
    setQuery("")
    inputRef.current?.focus()
  }

  if (!supabaseConfigured) return null

  const showDropdown = focused && query.trim().length > 0

  return (
    <div ref={containerRef} className={cn("relative", className)}>
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
        aria-label="Pesquisar amigos"
        placeholder="Pesquisa amigos por nome…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        className="h-10 px-9 text-sm md:h-9"
      />
      {query && (
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
          aria-label="Resultados de amigos"
          className="bg-card text-card-foreground border-border absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border shadow-lg"
        >
          {loading ? (
            <div className="text-muted-foreground flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : !results || results.length === 0 ? (
            <p className="text-muted-foreground px-3 py-3 text-sm">
              Ninguém encontrado.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {results.map((person) => {
                const initials = person.displayName.charAt(0).toUpperCase()
                return (
                  <li key={person.id}>
                    <Link
                      to={`/u/${person.id}`}
                      role="option"
                      aria-selected={false}
                      onClick={() => {
                        setFocused(false)
                        setQuery("")
                      }}
                      className="text-foreground hover:bg-muted/60 flex items-center gap-3 px-3 py-2 text-sm"
                    >
                      <span className="bg-primary text-primary-foreground inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold">
                        {person.avatarUrl ? (
                          <img
                            src={person.avatarUrl}
                            alt=""
                            className="size-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          initials
                        )}
                      </span>
                      <span className="truncate font-medium">
                        {person.displayName}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
