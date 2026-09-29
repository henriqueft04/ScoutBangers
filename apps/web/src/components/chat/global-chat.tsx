import * as React from "react"
import { Link } from "react-router-dom"
import {
  ListMusic,
  Loader2,
  Quote,
  SendHorizontal,
  Trash2,
  X,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"

import { TrackArtwork } from "@/components/library/track-artwork"
import { ConfirmDialog } from "@/components/profile/confirm-dialog"
import { useAuth } from "@/hooks/useAuth"
import { useFillToBottomBar } from "@/hooks/useFillToBottomBar"
import { useGlobalChat, type ChatMessage } from "@/hooks/useGlobalChat"
import { usePlayer } from "@/hooks/usePlayer"
import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import {
  onPendingShare,
  takePendingShare,
  type SharePayload,
} from "@/lib/chat-share"
import { relativeTime } from "@/lib/relative-time"

/** Consecutive messages from the same sender within this window collapse
 *  into one group — avatar/name/time shown once, the rest just bubbles. */
const GROUP_GAP_MS = 5 * 60 * 1000

/**
 * Ids of messages that just arrived via the live "message" event, as
 * opposed to ones already present in a "history" snapshot (initial load
 * or a post-reconnect resync) — only the former should play an entrance
 * animation, so reopening the chat or switching tabs back in doesn't
 * replay 50 animations at once.
 */
function useNewMessageIds(messages: ChatMessage[]): Set<string> {
  const previousIdsRef = React.useRef<Set<string>>(new Set())
  const isFirstBatchRef = React.useRef(true)

  return React.useMemo(() => {
    const previousIds = previousIdsRef.current
    const freshIds = new Set<string>()
    if (!isFirstBatchRef.current) {
      for (const message of messages) {
        if (!previousIds.has(message.id)) freshIds.add(message.id)
      }
    }
    previousIdsRef.current = new Set(messages.map((message) => message.id))
    isFirstBatchRef.current = false
    return freshIds
  }, [messages])
}

function isGroupStart(messages: ChatMessage[], index: number): boolean {
  const message = messages[index]
  const previous = messages[index - 1]
  if (!previous) return true
  if (previous.userId !== message.userId) return true
  return (
    Date.parse(message.createdAt) - Date.parse(previous.createdAt) >
    GROUP_GAP_MS
  )
}

/**
 * Chat for the whole community, backed by the `workers/chat` Durable
 * Object (see useGlobalChat) — no Supabase Postgres involvement, so this
 * page adds no load to the project's database.
 */
export function GlobalChat() {
  const { user, profile } = useAuth()
  const {
    messages,
    connectionState,
    error,
    disabled,
    sendMessage,
    deleteMessage,
    sendShare,
  } = useGlobalChat()
  const [draft, setDraft] = React.useState("")
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(
    null
  )
  const [stagedShare, setStagedShare] = React.useState<SharePayload | null>(
    () => takePendingShare()
  )

  // Covers a share staged while already sitting on /chat (e.g. opening the
  // fullscreen player from here and tapping "share to chat") — navigate()
  // to the same route doesn't remount this component, so the lazy
  // initializer above never re-runs on its own.
  React.useEffect(() => {
    return onPendingShare(() => {
      const share = takePendingShare()
      if (share) setStagedShare(share)
    })
  }, [])

  const newMessageIds = useNewMessageIds(messages)
  const scrollAnchorRef = React.useRef<HTMLDivElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const containerHeight = useFillToBottomBar(containerRef)

  // The message list scrolls internally (ScrollArea below); the outer page
  // shouldn't scroll at all on this route. AppShell's <main> sizes itself
  // to its content by default (min-height: auto), so even a few px of
  // slack in the fill-to-bottom-bar measurement above would otherwise
  // leak out as page scroll — locking body overflow here makes that slack
  // harmless instead of chasing pixel-perfect measurement.
  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  React.useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ block: "end" })
  }, [messages])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (stagedShare) {
      sendShare(stagedShare, draft.trim() || undefined)
      setStagedShare(null)
    } else {
      sendMessage(draft)
    }
    setDraft("")
  }

  const handleConfirmDelete = () => {
    if (pendingDeleteId) deleteMessage(pendingDeleteId)
    setPendingDeleteId(null)
  }

  if (!user) {
    return <EmptyState message="Inicia sessão para entrares na conversa." />
  }
  if (disabled) {
    return <EmptyState message="O chat não está disponível de momento." />
  }

  return (
    <div
      ref={containerRef}
      className="mx-auto flex h-[60svh] w-full max-w-2xl flex-col gap-3 px-3 pt-3 pb-3 md:h-[65svh] md:px-6 md:pt-4"
      style={containerHeight ? { height: containerHeight } : undefined}
    >
      <header className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
          Chat
        </h2>
        <ConnectionBadge state={connectionState} />
      </header>

      <ScrollArea className="border-border bg-card min-h-0 flex-1 rounded-md border">
        <div className="flex flex-col p-3">
          {messages.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Ainda não há mensagens. Sê o primeiro a escrever!
            </p>
          ) : (
            messages.map((message, index) => (
              <ChatMessageRow
                key={message.id}
                message={message}
                isOwn={message.userId === user.id}
                isGroupStart={isGroupStart(messages, index)}
                canDelete={Boolean(profile?.is_admin) || message.userId === user.id}
                onDelete={setPendingDeleteId}
                isNew={newMessageIds.has(message.id)}
              />
            ))
          )}
          <div ref={scrollAnchorRef} />
        </div>
      </ScrollArea>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Apagar mensagem?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Apagar"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />

      {error ? (
        <p className="text-destructive shrink-0 text-xs">{error}</p>
      ) : null}

      {stagedShare ? (
        <div className="border-border bg-card flex shrink-0 items-center gap-2 rounded-md border p-2">
          <div className="min-w-0 flex-1">
            <ShareCard share={stagedShare} isOwn={false} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remover anexo"
            onClick={() => setStagedShare(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2"
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            stagedShare
              ? "Adiciona uma legenda (opcional)..."
              : "Escreve uma mensagem..."
          }
          maxLength={500}
          disabled={connectionState !== "open"}
        />
        <Button
          type="submit"
          size="icon"
          disabled={
            connectionState !== "open" || (!stagedShare && !draft.trim())
          }
          aria-label="Enviar mensagem"
        >
          <SendHorizontal />
        </Button>
      </form>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[60vh] items-center justify-center px-6 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  )
}

function ConnectionBadge({
  state,
}: {
  state: "connecting" | "open" | "closed"
}) {
  if (state === "open") {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Ligado
      </span>
    )
  }
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Loader2 className="size-3 animate-spin" />
      {state === "connecting" ? "A ligar..." : "Sem ligação"}
    </span>
  )
}

interface ChatMessageRowProps {
  message: ChatMessage
  isOwn: boolean
  isGroupStart: boolean
  canDelete: boolean
  onDelete: (id: string) => void
  isNew: boolean
}

function ChatMessageRow({
  message,
  isOwn,
  isGroupStart,
  canDelete,
  onDelete,
  isNew,
}: ChatMessageRowProps) {
  const name = message.displayName ?? "Alguém"
  const initials = name.charAt(0).toUpperCase()

  return (
    <div
      className={cn(
        "group/message flex items-start gap-2.5",
        isOwn && "flex-row-reverse",
        isGroupStart ? "mt-3" : "mt-0.5",
        isNew &&
          "animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out"
      )}
    >
      {isGroupStart ? (
        <div className="bg-primary text-primary-foreground inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold">
          {message.avatarUrl ? (
            <img
              src={message.avatarUrl}
              alt=""
              className="size-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            initials
          )}
        </div>
      ) : (
        <div className="size-8 shrink-0" aria-hidden />
      )}
      <div
        className={cn(
          "flex min-w-0 max-w-[75%] flex-col",
          isOwn && "items-end"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-3 py-1.5 text-sm",
            isOwn
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          {isGroupStart && !isOwn ? (
            <p className="text-primary mb-0.5 text-xs font-semibold">{name}</p>
          ) : null}
          {message.share ? (
            <div className={message.body ? "mb-1.5" : undefined}>
              <ShareCard share={message.share} isOwn={isOwn} />
            </div>
          ) : null}
          {message.body ? (
            <p className="break-words whitespace-pre-wrap">{message.body}</p>
          ) : null}
          {isGroupStart ? (
            <p
              className={cn(
                "mt-0.5 text-right text-[10px] leading-none",
                isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
              )}
            >
              {relativeTime(message.createdAt)}
            </p>
          ) : null}
        </div>
      </div>
      {canDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover/message:opacity-100"
          aria-label="Apagar mensagem"
          onClick={() => onDelete(message.id)}
        >
          <Trash2 />
        </Button>
      ) : null}
    </div>
  )
}

/** Compact clickable card rendered inside a bubble for a shared
 *  song/lyric-snippet/playlist. Same component reused for the staged
 *  preview above the composer (with isOwn=false, i.e. the neutral tone). */
function ShareCard({ share, isOwn }: { share: SharePayload; isOwn: boolean }) {
  const toneClass = isOwn
    ? "border-primary-foreground/25 bg-primary-foreground/10"
    : "border-border bg-background/60"
  const iconToneClass = isOwn
    ? "bg-primary-foreground/15 text-primary-foreground"
    : "bg-primary/15 text-primary"

  // Only song/lyric shares have a song to fetch art for. The hook itself
  // handles an undefined id as a no-op (unconditional call keeps the rules
  // of hooks happy across the three branches below).
  const songId = share.kind === "playlist" ? undefined : share.payload.songId
  const meta = useTrackMetadata(songId, Boolean(songId))
  const { songs, play } = usePlayer()

  // Songs/lyrics play in place — a `<Link to="/?song=...">` would work too
  // (player-provider.tsx auto-plays that query param) but it navigates
  // away from whatever you're doing, including out of this chat. The mini
  // player bar is visible on every route, so there's no need to leave.
  const handlePlay = () => {
    if (!songId) return
    const index = songs.findIndex((s) => s.id === songId)
    if (index !== -1) play(index)
  }

  if (share.kind === "song") {
    const { title, artist } = share.payload
    return (
      <button
        type="button"
        onClick={handlePlay}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors hover:brightness-95",
          toneClass
        )}
      >
        <TrackArtwork meta={meta} className="size-8 rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          {artist ? (
            <span className="block truncate text-xs opacity-70">{artist}</span>
          ) : null}
        </span>
      </button>
    )
  }

  if (share.kind === "lyric") {
    // Static, not clickable — unlike the song card above, tapping a lyric
    // quote shouldn't start playback. It's here for context, not as a
    // play trigger.
    const { title, artist, snippet } = share.payload
    return (
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-xl border px-3 py-2",
          toneClass
        )}
      >
        <TrackArtwork meta={meta} className="mt-0.5 size-8 rounded-lg" />
        <span className="min-w-0 flex-1">
          <p className="flex items-start gap-1.5 text-sm leading-snug whitespace-pre-wrap italic">
            <Quote className="mt-0.5 size-3.5 shrink-0 opacity-60" />
            {snippet}
          </p>
          <p className="truncate text-xs not-italic opacity-70">
            {[title, artist].filter(Boolean).join(" · ")}
          </p>
        </span>
      </div>
    )
  }

  const { playlistId, name, songCount } = share.payload
  return (
    <Link
      to={`/playlists/${playlistId}`}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors hover:brightness-95",
        toneClass
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          iconToneClass
        )}
      >
        <ListMusic className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block truncate text-xs opacity-70">
          {songCount} {songCount === 1 ? "música" : "músicas"}
        </span>
      </span>
    </Link>
  )
}
