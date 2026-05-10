import * as React from "react"
import { Loader2, LogIn, Moon, RefreshCw, Sun } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { SignInDialog } from "@/components/auth/sign-in-dialog"
import { useAuth } from "@/hooks/useAuth"
import { usePlayer } from "@/hooks/usePlayer"
import { useTheme } from "@/hooks/useTheme"
import { supabaseConfigured } from "@/lib/supabase"

interface HeaderProps {
  className?: string
}

export function Header({ className }: HeaderProps) {
  const { reload, loading } = usePlayer()
  const { theme, toggle } = useTheme()
  const { user, profile } = useAuth()
  const [signInOpen, setSignInOpen] = React.useState(false)
  return (
    <header
      className={cn(
        "border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 border-b backdrop-blur",
        "pt-[env(safe-area-inset-top)]",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-3 py-2 md:px-6 md:py-3 lg:justify-end lg:gap-2">
        <h1 className="lg:hidden">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <img
              src="/icon-header.png"
              alt=""
              width={45}
              height={36}
              className="h-9 w-auto rounded-md"
            />
            <span className="text-foreground text-base font-semibold tracking-tight md:text-lg">
              ScoutBangers
            </span>
          </Link>
        </h1>
        <div className="flex items-center gap-1">
          {supabaseConfigured && !user ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Iniciar sessão"
              onClick={() => setSignInOpen(true)}
              className="touch-manipulation"
            >
              <LogIn />
            </Button>
          ) : null}
          {user ? (
            <Link
              to="/profile"
              aria-label="Abrir perfil"
              className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
            >
              {profile?.avatar_url || user.user_metadata?.avatar_url ? (
                <img
                  src={profile?.avatar_url ?? user.user_metadata?.avatar_url}
                  alt=""
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                (profile?.display_name ?? user.email ?? "U").charAt(0).toUpperCase()
              )}
            </Link>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={theme === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}
            onClick={toggle}
            className="touch-manipulation"
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Atualizar músicas"
            onClick={reload}
            disabled={loading}
            className="touch-manipulation"
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        </div>
        <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
      </div>
    </header>
  )
}
