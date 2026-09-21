import * as React from "react"
import { ShieldAlert, Check, X, Play, Pause, Edit3 } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/lib/supabase"

interface Submission {
  id: string
  user_id: string
  status: string
  title: string
  artist: string
  album: string | null
  year: string | null
  genre: string | null
  audio_path: string
  thumbnail_path: string | null
  created_at: string
  profiles?: {
    display_name: string | null
  }
}

function SubmissionRow({ 
  sub, 
  onApprove, 
  onReject, 
  onPlay, 
  playingId,
  actionLoading 
}: { 
  sub: Submission, 
  onApprove: (id: string, edits: Partial<Submission>) => void, 
  onReject: (id: string) => void,
  onPlay: (sub: Submission) => void,
  playingId: string | null,
  actionLoading: string | null
}) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [edits, setEdits] = React.useState({
    title: sub.title,
    artist: sub.artist,
    album: sub.album || "",
    year: sub.year || "",
    genre: sub.genre || ""
  })

  const handleApprove = () => {
    onApprove(sub.id, edits)
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-4 flex-1 overflow-hidden">
          <Button 
            variant="secondary" 
            size="icon" 
            aria-label={playingId === sub.id ? "Pausar pré-visualização" : "Reproduzir pré-visualização"}
            className="shrink-0 rounded-full size-12"
            onClick={() => onPlay(sub)}
          >
            {playingId === sub.id ? <Pause className="size-5" /> : <Play className="size-5 ml-1" />}
          </Button>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-base font-semibold text-foreground">
              {sub.title}
            </h4>
            <p className="truncate text-sm text-muted-foreground">
              {sub.artist} {sub.album && `• ${sub.album}`} {sub.year && `• ${sub.year}`}
            </p>
            {sub.genre && (
              <span className="mt-1 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {sub.genre}
              </span>
            )}
            <p className="mt-1 text-xs text-muted-foreground/80">
              Enviado por: {sub.profiles?.display_name || "Utilizador desconhecido"}
            </p>
          </div>
        </div>
        
        <div className="flex w-full sm:w-auto items-center gap-2 pt-4 sm:pt-0 border-t sm:border-0 border-border">
          <Button 
            variant="ghost"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? <X className="size-4" /> : <Edit3 className="size-4 mr-2" />}
            {isEditing ? "Cancelar" : "Editar Meta"}
          </Button>
          {sub.status === "pending" && (
            <Button 
              variant="outline" 
              className="flex-1 sm:flex-none bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20"
              disabled={actionLoading === sub.id}
              onClick={() => onReject(sub.id)}
            >
              <X className="mr-2 size-4" />
              Rejeitar
            </Button>
          )}
          <Button 
            className="flex-1 sm:flex-none bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20 border"
            disabled={actionLoading === sub.id}
            onClick={handleApprove}
          >
            <Check className="mr-2 size-4" />
            {actionLoading === sub.id ? "A aprovar..." : "Aprovar"}
          </Button>
        </div>
      </div>
      
      {isEditing && (
        <div className="mt-4 grid gap-4 rounded-lg bg-muted/30 p-4 sm:grid-cols-2 md:grid-cols-5">
          <div className="space-y-2">
            <label className="text-xs font-medium">Título</label>
            <Input 
              value={edits.title} 
              onChange={e => setEdits({ ...edits, title: e.target.value })} 
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Artista</label>
            <Input 
              value={edits.artist} 
              onChange={e => setEdits({ ...edits, artist: e.target.value })} 
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Álbum</label>
            <Input 
              value={edits.album} 
              onChange={e => setEdits({ ...edits, album: e.target.value })} 
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Ano</label>
            <Input 
              value={edits.year} 
              onChange={e => setEdits({ ...edits, year: e.target.value })} 
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Género</label>
            <Input 
              value={edits.genre} 
              onChange={e => setEdits({ ...edits, genre: e.target.value })} 
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function AdminPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = React.useState<"pending" | "rejected">("pending")
  const [submissions, setSubmissions] = React.useState<Submission[]>([])
  const [loading, setLoading] = React.useState(true)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)
  
  const [playingId, setPlayingId] = React.useState<string | null>(null)
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  React.useEffect(() => {
    if (profile && !profile.is_admin) {
      navigate("/")
      return
    }

    if (profile?.is_admin) {
      fetchSubmissions()
    }
  }, [profile, navigate, tab])

  const fetchSubmissions = async () => {
    setLoading(true)
    let query = supabase!
      .from("song_submissions")
      .select("*")
      .eq("status", tab)
      .order("created_at", { ascending: false })
      
    if (tab === "rejected") {
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte("created_at", lastWeek)
    }
    
    const { data, error } = await query
    
    if (data && !error) {
      const userIds = Array.from(new Set(data.map(d => d.user_id)))
      if (userIds.length > 0) {
        const { data: profiles } = await supabase!
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds)
        
        if (profiles) {
          const profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, p]))
          setSubmissions(data.map(d => ({ ...d, profiles: profileMap[d.user_id] })))
          setLoading(false)
          return
        }
      }
      setSubmissions(data)
    }
    setLoading(false)
  }

  const handleApprove = async (id: string, edits: Partial<Submission>) => {
    setActionLoading(id)
    try {
      const { data: { session } } = await supabase!.auth.getSession()
      if (!session) return

      const res = await fetch(`/api/submissions/${id}/approve`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(edits)
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao aprovar")
      }

      setSubmissions(s => s.filter(x => x.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (id: string) => {
    if (!confirm("Tens a certeza que queres rejeitar esta submissão? (Será movida para a caixa de rejeitados por 7 dias)")) return
    setActionLoading(id)
    try {
      const { data: { session } } = await supabase!.auth.getSession()
      if (!session) return

      const res = await fetch(`/api/submissions/${id}/reject`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      })

      if (!res.ok) {
        throw new Error("Erro ao rejeitar")
      }

      setSubmissions(s => s.filter(x => x.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setActionLoading(null)
    }
  }

  const togglePlay = (sub: Submission) => {
    if (playingId === sub.id && audioRef.current) {
      audioRef.current.pause()
      setPlayingId(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
    }

    // We can't use publicUrl if bucket is private. Since bucket is private, we need signed URL or download.
    // Let's get a signed URL instead
    supabase!.storage.from("submissions").createSignedUrl(sub.audio_path, 3600).then(({ data: signed }) => {
      if (!signed) return
      
      const audio = new Audio(signed.signedUrl)
      audioRef.current = audio
      audio.play()
      setPlayingId(sub.id)
      
      audio.onended = () => {
        setPlayingId(null)
      }
    })
  }

  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  if (!profile?.is_admin) return null

  return (
    <div className="flex w-full flex-col p-4 pb-32 sm:p-6 md:p-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-border pb-6 gap-4">
          <div>
            <h1 className="flex items-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              <ShieldAlert className="mr-3 size-8 text-primary" />
              Painel de Administração
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Aprova ou rejeita submissões de músicas pendentes.
            </p>
          </div>
          <div className="flex bg-muted/50 p-1 rounded-lg shrink-0">
            <button
              onClick={() => setTab("pending")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === "pending" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Pendentes
            </button>
            <button
              onClick={() => setTab("rejected")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === "rejected" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Rejeitados
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex py-12 items-center justify-center text-muted-foreground">
            A carregar submissões...
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex py-12 flex-col items-center justify-center text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Check className="size-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Tudo limpo!</h3>
            <p className="text-sm text-muted-foreground">Não há submissões pendentes de momento.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {submissions.map((sub) => (
              <SubmissionRow 
                key={sub.id} 
                sub={sub} 
                onApprove={handleApprove} 
                onReject={handleReject}
                onPlay={togglePlay}
                playingId={playingId}
                actionLoading={actionLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
