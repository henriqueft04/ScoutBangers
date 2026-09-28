import { verifySupabaseToken } from "./verify-token"

export { ChatRoom } from "./chat-room"

interface Env {
  CHAT_ROOM: DurableObjectNamespace
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
}

const GLOBAL_ROOM_NAME = "global"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 })
    }

    const token = new URL(request.url).searchParams.get("token")
    if (!token) return new Response("Unauthorized", { status: 401 })

    const user = await verifySupabaseToken(token, env.SUPABASE_URL)
    if (!user) return new Response("Unauthorized", { status: 401 })

    const headers = new Headers(request.headers)
    headers.set("X-User-Id", user.id)
    headers.set("X-User-Token", token)

    const id = env.CHAT_ROOM.idFromName(GLOBAL_ROOM_NAME)
    return env.CHAT_ROOM.get(id).fetch(new Request(request, { headers }))
  },
}
