import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "./database.types"

/**
 * Singleton Supabase client. Reads `VITE_SUPABASE_URL` and
 * `VITE_SUPABASE_ANON_KEY` from Vite's import.meta.env (baked in at build).
 *
 * If either is missing the app stays usable as an anonymous-only experience —
 * `supabase` is null and call sites short-circuit. Lets us deploy v3 code
 * before the Supabase project is wired up.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient<Database> | null =
  url && anonKey
    ? createClient<Database>(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null

export const supabaseConfigured = supabase !== null
