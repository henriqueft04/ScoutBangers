/**
 * Client-side helpers for the admin-only Drive sync button.
 *
 * The list of admin emails lives in `VITE_ADMIN_EMAILS` (comma-
 * separated). It's only used to decide whether to render the button —
 * the real gate is server-side in `functions/api/sync.ts`, which
 * re-checks the same allowlist against the verified JWT's email claim.
 * Editing the client list does NOT grant access on its own.
 */

import { useAuth } from "@/hooks/useAuth"
import { supabase } from "./supabase"

function adminEmails(): Set<string> {
  const raw =
    (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? ""
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function useIsAdmin(): boolean {
  const { user } = useAuth()
  const email = user?.email?.toLowerCase()
  if (!email) return false
  return adminEmails().has(email)
}

export async function triggerDriveSync(): Promise<void> {
  if (!supabase) throw new Error("Sessão indisponível.")
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Sessão expirada.")

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    let detail = `Erro ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) detail = body.error
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
}
