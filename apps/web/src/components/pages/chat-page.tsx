import { GlobalChat } from "@/components/chat/global-chat"

/**
 * Mounted at /chat. Lives in `pages/` to keep the route → component
 * mapping in `App.tsx` legible, same convention as `library-page.tsx`.
 */
export function ChatPage() {
  return <GlobalChat />
}
