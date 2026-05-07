import * as React from "react"
import type { Session, User } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"

export type Profile = Database["public"]["Tables"]["profiles"]["Row"]

export interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
}

export interface AuthContextValue extends AuthState {
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithEmail: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = React.createContext<AuthContextValue | null>(null)
