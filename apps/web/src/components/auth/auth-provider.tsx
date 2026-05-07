import * as React from "react"
import type { User } from "@supabase/supabase-js"

import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
} from "@/hooks/auth-context"
import { supabase } from "@/lib/supabase"

/**
 * Wraps the app so any descendant can read auth state via {@link useAuth}.
 * Subscribes to Supabase's `onAuthStateChange` so sign-in/out is reactive
 * across tabs.
 *
 * If Supabase is not configured (no env vars), the provider becomes a no-op
 * — anonymous-only mode. All actions resolve to a "Supabase not configured"
 * error so call sites can render disabled UI.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>(() => ({
    session: null,
    user: null,
    profile: null,
    loading: supabase !== null,
  }))

  const loadProfile = React.useCallback(async (user: User) => {
    if (!supabase) return null
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
    return data ?? null
  }, [])

  React.useEffect(() => {
    if (!supabase) return
    let cancelled = false

    const handleSession = (session: Awaited<
      ReturnType<NonNullable<typeof supabase>["auth"]["getSession"]>
    >["data"]["session"]) => {
      if (cancelled) return
      const user = session?.user ?? null
      // Render immediately with what we know — don't block UI on profile.
      setState({ session, user, profile: null, loading: false })
      if (user) {
        void loadProfile(user).then((profile) => {
          if (!cancelled) {
            setState((prev) => ({ ...prev, profile }))
          }
        })
      }
    }

    void supabase.auth.getSession().then(({ data }) => handleSession(data.session))

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => handleSession(session)
    )

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signInWithGoogle = React.useCallback(async () => {
    if (!supabase) throw new Error("Supabase not configured")
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    })
  }, [])

  const signInWithEmail = React.useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: "Supabase not configured" }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error?.message ?? null }
    },
    []
  )

  const signUpWithEmail = React.useCallback(
    async (email: string, password: string, displayName?: string) => {
      if (!supabase) return { error: "Supabase not configured" }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: displayName ? { name: displayName } : undefined },
      })
      return { error: error?.message ?? null }
    },
    []
  )

  const signOut = React.useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const refreshProfile = React.useCallback(async () => {
    if (!state.user) return
    const profile = await loadProfile(state.user)
    setState((prev) => ({ ...prev, profile }))
  }, [state.user, loadProfile])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      ...state,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      refreshProfile,
    }),
    [state, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut, refreshProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
