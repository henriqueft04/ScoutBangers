import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Upload, X, FileAudio, ImageIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/lib/supabase"

export function SubmitPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  
  const [title, setTitle] = React.useState("")
  const [artist, setArtist] = React.useState("")
  const [album, setAlbum] = React.useState("")
  const [year, setYear] = React.useState("")
  const [genre, setGenre] = React.useState("")
  
  const [audioFile, setAudioFile] = React.useState<File | null>(null)
  const [coverFile, setCoverFile] = React.useState<File | null>(null)
  
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.user.id) return
    if (!title || !artist || !audioFile || !coverFile) {
      setError("Por favor, preenche todos os campos obrigatórios e adiciona o ficheiro de áudio e a capa.")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // 1. Upload audio
      const safeName = `${artist} - ${title}`.replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '_')
      
      const audioExt = audioFile.name.split('.').pop()
      const audioPath = `${session.user.id}/${Date.now()}_${safeName}.${audioExt}`
      const { error: audioError } = await supabase!.storage
        .from("submissions")
        .upload(audioPath, audioFile)
      
      if (audioError) throw audioError

      // 2. Upload cover
      const coverExt = coverFile.name.split('.').pop()
      const coverPath = `${session.user.id}/${Date.now()}_${safeName}_cover.${coverExt}`
      const { error: coverError } = await supabase!.storage
        .from("submissions")
        .upload(coverPath, coverFile)
      
      if (coverError) throw coverError

      // 3. Insert into song_submissions
      const { error: dbError } = await supabase!.from("song_submissions").insert({
        user_id: session.user.id,
        title,
        artist,
        album: album || null,
        year: year || null,
        genre: genre || null,
        audio_path: audioPath,
        thumbnail_path: coverPath,
      })

      if (dbError) throw dbError

      // Done
      navigate("/", { replace: true })
    } catch (err) {
      console.error(err)
      setError("Ocorreu um erro ao enviar a música. Tenta novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex w-full flex-col p-4 pb-32 sm:p-6 md:p-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Submeter Música
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Adiciona uma nova música à plataforma. A música será analisada por um administrador antes de ficar disponível.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                Título *
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Em Família"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="artist" className="text-sm font-medium">
                Artista *
              </label>
              <Input
                id="artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Ex: 680 Santão"
                required
              />
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="space-y-2">
              <label htmlFor="album" className="text-sm font-medium">
                Álbum
              </label>
              <Input
                id="album"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="year" className="text-sm font-medium">
                Ano
              </label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="genre" className="text-sm font-medium">
                Género
              </label>
              <Input
                id="genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Ficheiro de Áudio (.mp3) *</label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('audio-upload')?.click()}
                  className="w-full sm:w-auto shrink-0"
                >
                  <FileAudio className="mr-2 size-4" />
                  {audioFile ? "Alterar Áudio" : "Selecionar Áudio"}
                </Button>
                <input
                  id="audio-upload"
                  type="file"
                  accept=".mp3,audio/mpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) setAudioFile(file)
                  }}
                />
                {audioFile && (
                  <div className="flex min-w-0 flex-1 items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <span className="truncate">{audioFile.name}</span>
                    <button type="button" onClick={() => setAudioFile(null)} className="ml-2 shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Capa *</label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('cover-upload')?.click()}
                  className="w-full sm:w-auto shrink-0"
                >
                  <ImageIcon className="mr-2 size-4" />
                  {coverFile ? "Alterar Capa" : "Selecionar Capa"}
                </Button>
                <input
                  id="cover-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) setCoverFile(file)
                  }}
                />
                {coverFile && (
                  <div className="flex min-w-0 flex-1 items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <span className="truncate">{coverFile.name}</span>
                    <button type="button" onClick={() => setCoverFile(null)} className="ml-2 shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-6">
            <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={isSubmitting}>
              {isSubmitting ? (
                <>Enviando...</>
              ) : (
                <>
                  <Upload className="mr-2 size-4" />
                  Submeter Música
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
