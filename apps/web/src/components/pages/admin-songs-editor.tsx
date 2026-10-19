import * as React from "react"
import { Edit3, ImagePlus, Loader2, Search } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { usePlayer } from "@/hooks/usePlayer"
import type { EditableTags } from "@/lib/id3-rewrite"
import { loadSong, saveSong, type LoadedSong } from "@/lib/song-editor"
import type { Song } from "@/lib/types"

const FIELDS: Array<{ key: keyof EditableTags; label: string }> = [
  { key: "title", label: "Título" },
  { key: "artist", label: "Artista" },
  { key: "album", label: "Álbum" },
  { key: "year", label: "Ano" },
  { key: "genre", label: "Género (separa por vírgulas)" },
]

export function AdminSongsEditor() {
  const { songs, reload } = usePlayer()
  const [query, setQuery] = React.useState("")
  const [editing, setEditing] = React.useState<Song | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  // Alphabetical by title, accent- and case-insensitive (pt locale), with
  // numbers ordered naturally ("2" before "10").
  const sorted = React.useMemo(
    () =>
      [...songs].sort((a, b) =>
        a.title.localeCompare(b.title, "pt", {
          sensitivity: "base",
          numeric: true,
        })
      ),
    [songs]
  )

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? sorted.filter((s) => s.title.toLowerCase().includes(q))
      : sorted
    return list.slice(0, 100)
  }, [sorted, query])

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar música…"
          className="pl-9"
        />
      </div>

      {notice ? (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
          {notice}
        </p>
      ) : null}

      <ul className="divide-border border-border divide-y rounded-lg border">
        {filtered.map((song) => (
          <li key={song.id} className="flex items-center gap-3 p-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {song.title}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setNotice(null)
                setEditing(song)
              }}
            >
              <Edit3 />
              Editar
            </Button>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="text-muted-foreground p-6 text-center text-sm">
            Nenhuma música encontrada.
          </li>
        ) : null}
      </ul>
      {!query && songs.length > 100 ? (
        <p className="text-muted-foreground text-center text-xs">
          A mostrar 100 de {songs.length} — usa a pesquisa para encontrar mais.
        </p>
      ) : null}

      {editing ? (
        <SongEditDialog
          song={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setNotice(
              "Guardado. A música mantém as reproduções; a nova versão aparece na app em breve."
            )
            reload()
          }}
        />
      ) : null}
    </div>
  )
}

interface SongEditDialogProps {
  song: Song
  onClose: () => void
  onSaved: () => void
}

function SongEditDialog({ song, onClose, onSaved }: SongEditDialogProps) {
  const [loaded, setLoaded] = React.useState<LoadedSong | null>(null)
  const [tags, setTags] = React.useState<EditableTags | null>(null)
  const [cover, setCover] = React.useState<File | null>(null)
  const [coverUrl, setCoverUrl] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    loadSong(song.id)
      .then((l) => {
        if (cancelled) return
        setLoaded(l)
        setTags(l.parsed.tags)
        if (l.parsed.cover) {
          // Copy into a fresh ArrayBuffer-backed array: Blob rejects views
          // over a SharedArrayBuffer-typed buffer.
          const bytes = new Uint8Array(l.parsed.cover.data)
          setCoverUrl(
            URL.createObjectURL(new Blob([bytes], { type: l.parsed.cover.mimeType }))
          )
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar.")
      })
    return () => {
      cancelled = true
    }
  }, [song.id])

  React.useEffect(() => {
    return () => {
      if (coverUrl) URL.revokeObjectURL(coverUrl)
    }
  }, [coverUrl])

  const pickCover = (file: File | undefined) => {
    if (!file) return
    setCover(file)
    setCoverUrl(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!loaded || !tags) return
    if (!tags.title.trim()) {
      setError("O título não pode ficar vazio.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveSong(song.id, loaded, tags, cover ?? undefined)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao guardar.")
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Editar ${song.title}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="bg-card border-border flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Editar metadados</h2>

        {!tags ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
            {error ? (
              <span className="text-destructive">{error}</span>
            ) : (
              <>
                <Loader2 className="size-4 animate-spin" />A carregar do Drive…
              </>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div className="bg-muted size-24 shrink-0 overflow-hidden rounded-md">
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="size-full object-cover" />
                ) : null}
              </div>
              <label className="text-primary inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                <ImagePlus className="size-4" />
                {coverUrl ? "Mudar capa" : "Adicionar capa"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => pickCover(e.target.files?.[0])}
                />
              </label>
            </div>

            {FIELDS.map(({ key, label }) => (
              <label key={key} className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <Input
                  value={tags[key]}
                  inputMode={key === "year" ? "numeric" : undefined}
                  onChange={(e) => setTags({ ...tags, [key]: e.target.value })}
                />
              </label>
            ))}

            <p className="text-muted-foreground text-xs">
              O ficheiro no Drive é substituído por uma nova versão (o ID é o
              mesmo, por isso as reproduções, favoritos e playlists mantêm-se).
              A versão anterior fica guardada no histórico do Drive.
            </p>

            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={handleSave}
            disabled={!tags || saving}
          >
            {saving ? <Loader2 className="animate-spin" /> : null}
            Guardar
          </Button>
        </div>
      </div>
    </div>
  )
}
