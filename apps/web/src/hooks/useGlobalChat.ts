import * as React from "react"

import { useAuth } from "./useAuth"

export interface ChatMessage {
  id: string
  userId: string
  displayName: string | null
  avatarUrl: string | null
  body: string
  createdAt: string
}

type ServerEvent =
  | { type: "history"; messages: ChatMessage[] }
  | { type: "message"; message: ChatMessage }
  | { type: "deleted"; id: string }
  | { type: "error"; message: string }

export type ChatConnectionState = "connecting" | "open" | "closed"

const WORKER_URL: string | undefined = import.meta.env.VITE_CHAT_WORKER_URL
const RECONNECT_DELAY_MS = 3000

function toWebSocketUrl(httpUrl: string, token: string): string {
  const url = new URL(httpUrl)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.searchParams.set("token", token)
  return url.toString()
}

interface UseGlobalChatResult {
  messages: ChatMessage[]
  connectionState: ChatConnectionState
  error: string | null
  /** True when chat isn't usable: not configured, or signed out. */
  disabled: boolean
  sendMessage: (body: string) => void
  deleteMessage: (id: string) => void
}

/**
 * Global chat over a single WebSocket to the `workers/chat` Durable
 * Object — same "pause when the tab is hidden" idiom as useStats.ts, both
 * to save battery and to stay well within the chat Worker's free daily
 * request budget. History and live messages share one in-memory list kept
 * in send order; the Worker is the single source of truth, this hook holds
 * no optimistic state of its own.
 */
export function useGlobalChat(): UseGlobalChatResult {
  const { session } = useAuth()
  const token = session?.access_token ?? null

  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [connectionState, setConnectionState] =
    React.useState<ChatConnectionState>("closed")
  const [error, setError] = React.useState<string | null>(null)

  const socketRef = React.useRef<WebSocket | null>(null)
  const reconnectTimerRef = React.useRef<ReturnType<typeof setTimeout>>()

  const disabled = !WORKER_URL || !token

  React.useEffect(() => {
    if (disabled) return

    let cancelled = false

    const connect = () => {
      if (cancelled || !WORKER_URL || !token) return
      setConnectionState("connecting")
      const socket = new WebSocket(toWebSocketUrl(WORKER_URL, token))
      socketRef.current = socket

      socket.onopen = () => {
        if (cancelled) return
        setConnectionState("open")
        setError(null)
      }

      socket.onmessage = (event) => {
        if (cancelled) return
        let payload: ServerEvent
        try {
          payload = JSON.parse(event.data as string)
        } catch {
          return
        }
        if (payload.type === "history") {
          setMessages(payload.messages)
        } else if (payload.type === "message") {
          setMessages((prev) => [...prev, payload.message])
        } else if (payload.type === "deleted") {
          setMessages((prev) => prev.filter((m) => m.id !== payload.id))
        } else if (payload.type === "error") {
          setError(payload.message)
        }
      }

      socket.onclose = () => {
        if (cancelled) return
        setConnectionState("closed")
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }

    const disconnect = () => {
      clearTimeout(reconnectTimerRef.current)
      socketRef.current?.close()
      socketRef.current = null
      setConnectionState("closed")
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") connect()
      else disconnect()
    }

    if (document.visibilityState === "visible") connect()
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibility)
      disconnect()
    }
  }, [disabled, token])

  const send = React.useCallback((event: object) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event))
    }
  }, [])

  const sendMessage = React.useCallback(
    (body: string) => {
      if (!body.trim()) return
      send({ type: "send", body })
    },
    [send]
  )

  const deleteMessage = React.useCallback(
    (id: string) => send({ type: "delete", id }),
    [send]
  )

  return {
    messages,
    connectionState,
    error,
    disabled,
    sendMessage,
    deleteMessage,
  }
}
