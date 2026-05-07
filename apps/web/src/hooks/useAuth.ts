import * as React from "react"

import { AuthContext, type AuthContextValue } from "./auth-context"

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
