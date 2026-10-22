import { supabase } from "./supabase"

/** The signed-in user's access token, for calls to our own `/api/*` functions. */
export async function getAccessToken(): Promise<string> {
  if (!supabase) throw new Error("Sessão indisponível.")
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Sessão expirada. Volta a iniciar sessão.")
  return token
}
