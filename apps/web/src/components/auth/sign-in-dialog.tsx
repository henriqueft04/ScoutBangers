import * as React from "react"
import { createPortal } from "react-dom"
import { Loader2, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { useAuth } from "@/hooks/useAuth"
import { supabaseConfigured } from "@/lib/supabase"

interface SignInDialogProps {
  open: boolean
  onClose: () => void
}

type Mode = "signin" | "signup"

/**
 * Modal dialog for authentication. Shows tabs for Sign In / Create Account
 * with email + password fields, plus a single "Continue with Google" button.
 *
 * Closes on Escape, on backdrop click, and after successful email sign-in
 * (Google redirects away so close happens implicitly when the user returns).
 */
export function SignInDialog({ open, onClose }: SignInDialogProps) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth()
  const [mode, setMode] = React.useState<Mode>("signin")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [displayName, setDisplayName] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [info, setInfo] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  const handleGoogle = async () => {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed")
      setBusy(false)
    }
  }

  const handleEmail = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    if (mode === "signin") {
      const { error } = await signInWithEmail(email, password)
      if (error) {
        setError(error)
        setBusy(false)
      } else {
        onClose()
      }
    } else {
      const { error } = await signUpWithEmail(
        email,
        password,
        displayName || undefined
      )
      if (error) {
        setError(error)
        setBusy(false)
      } else {
        setInfo("Check your email for a confirmation link.")
        setBusy(false)
      }
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "signin" ? "Sign in" : "Create account"}
      className="bg-background/80 fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground border-border animate-in slide-in-from-bottom md:slide-in-from-bottom-0 md:fade-in w-full max-w-md rounded-t-2xl border p-6 shadow-xl duration-200 ease-out md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create account"}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>

        {!supabaseConfigured ? (
          <p className="text-muted-foreground text-sm">
            Authentication isn't configured yet. The site owner needs to set
            VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
          </p>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full touch-manipulation"
              onClick={handleGoogle}
              disabled={busy}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="mr-2 size-4"
              >
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.55c2.08-1.91 3.29-4.74 3.29-8.09Z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.55-2.76c-.99.66-2.25 1.06-3.73 1.06-2.87 0-5.3-1.94-6.17-4.55H2.18v2.85A11 11 0 0 0 12 23Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.83 14.09a6.6 6.6 0 0 1 0-4.18V7.06H2.18a11 11 0 0 0 0 9.88l3.65-2.85Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.65 2.85C6.7 7.32 9.13 5.38 12 5.38Z"
                />
              </svg>
              Continue with Google
            </Button>

            <div className="my-4 flex items-center gap-2">
              <div className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                or
              </span>
              <div className="bg-border h-px flex-1" />
            </div>

            <form className="flex flex-col gap-3" onSubmit={handleEmail}>
              {mode === "signup" ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Display name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoComplete="nickname"
                    className="border-input bg-background focus-visible:ring-ring/40 rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                  />
                </label>
              ) : null}
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  className="border-input bg-background focus-visible:ring-ring/40 rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Password</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  className="border-input bg-background focus-visible:ring-ring/40 rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                />
              </label>

              {error ? (
                <p className="text-destructive text-xs">{error}</p>
              ) : null}
              {info ? (
                <p className="text-muted-foreground text-xs">{info}</p>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="mt-4 text-center text-xs">
              {mode === "signin" ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setMode("signup")}
                >
                  No account yet? <span className="underline">Create one</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setMode("signin")}
                >
                  Already have an account?{" "}
                  <span className="underline">Sign in</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
