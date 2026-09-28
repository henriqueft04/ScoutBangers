import * as React from "react"
import { Loader2, SendHorizontal, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"

import { useAuth } from "@/hooks/useAuth"
import { useFillToBottomBar } from "@/hooks/useFillToBottomBar"
import { useGlobalChat, type ChatMessage } from "@/hooks/useGlobalChat"
import { relativeTime } from "@/lib/relative-time"

/** Consecutive messages from the same sender within this window collapse
 *  into one group — avatar/name/time shown once, the rest just bubbles. */
const GROUP_GAP_MS = 5 * 60 * 1000

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
  } = useGlobalChat()
  const [draft, setDraft] = React.useState("")
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
    sendMessage(draft)
    setDraft("")
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
                canDelete={Boolean(profile?.is_admin)}
                onDelete={deleteMessage}
              />
            ))
          )}
          <div ref={scrollAnchorRef} />
        </div>
      </ScrollArea>

      {error ? (
        <p className="text-destructive shrink-0 text-xs">{error}</p>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2"
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Escreve uma mensagem..."
          maxLength={500}
          disabled={connectionState !== "open"}
        />
        <Button
          type="submit"
          size="icon"
          disabled={connectionState !== "open" || !draft.trim()}
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
}

function ChatMessageRow({
  message,
  isOwn,
  isGroupStart,
  canDelete,
  onDelete,
}: ChatMessageRowProps) {
  const name = message.displayName ?? "Alguém"
  const initials = name.charAt(0).toUpperCase()

  return (
    <div
      className={cn(
        "group/message flex items-start gap-2.5",
        isOwn && "flex-row-reverse",
        isGroupStart ? "mt-3" : "mt-0.5"
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
          <p className="break-words whitespace-pre-wrap">{message.body}</p>
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
