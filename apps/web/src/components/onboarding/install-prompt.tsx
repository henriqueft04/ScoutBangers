import * as React from "react"
import { createPortal } from "react-dom"
import { Apple, ArrowDown, Download, Share, Smartphone, X } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { promptInstall, useInstall } from "@/lib/install"

// The popup shows on the 1st opening, then every 10th (11th, 21st, ...)
// until the app is installed. An "opening" is a browser session, so
// reloads and tab switches within one visit don't count.
const OPEN_COUNT_KEY = "scoutbangers:install-prompt-opens-v1"
const COUNTED_KEY = "scoutbangers:install-prompt-counted-session"
const SHOW_EVERY = 10

// Cached so React StrictMode's double effect run doesn't count twice.
let showThisSession: boolean | null = null

function shouldShowThisSession(): boolean {
  if (showThisSession !== null) return showThisSession
  showThisSession = false
  try {
    if (sessionStorage.getItem(COUNTED_KEY) === "1") return false
    sessionStorage.setItem(COUNTED_KEY, "1")
    const opens = (Number(localStorage.getItem(OPEN_COUNT_KEY)) || 0) + 1
    localStorage.setItem(OPEN_COUNT_KEY, String(opens))
    showThisSession = opens % SHOW_EVERY === 1
  } catch {
    /* storage unavailable: stay quiet rather than nag every time */
  }
  return showThisSession
}

type Platform = "ios" | "android"

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "android"
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return "ios"
  return "android"
}

/**
 * Aparece na primeira vez que o utilizador abre a app no browser
 * (não quando já está instalada como PWA). Explica como instalar
 * conforme a plataforma e tem um link para a página "Sobre" com
 * instruções mais completas. Conteúdo em português.
 *
 * Persistência: conta as aberturas da app (localStorage) e aparece na
 * 1.ª e depois a cada 10 aberturas, enquanto a app não estiver
 * instalada.
 * O botão no header permite abrir as instruções a qualquer momento.
 */
export function InstallPrompt() {
  const { installed } = useInstall()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (installed) return
    if (!shouldShowThisSession()) return
    // Pequeno delay para a app carregar primeiro — evita aparecer
    // antes de o utilizador ver sequer o que estamos a propor.
    const timer = setTimeout(() => setOpen(true), 1200)
    return () => clearTimeout(timer)
  }, [installed])

  const close = React.useCallback(() => setOpen(false), [])

  return <InstallDialog open={open && !installed} onClose={close} />
}

interface InstallDialogProps {
  open: boolean
  onClose: () => void
}

export function InstallDialog({ open, onClose }: InstallDialogProps) {
  const { canPrompt } = useInstall()
  // Detected synchronously on the first render so the initial
  // selected tab matches the user's device. The effect-driven path
  // would race with the modal becoming visible.
  const [platform, setPlatform] = React.useState<Platform>(detectPlatform)
  // iOS: swap the dialog for a pointer at Safari's toolbar.
  const [hintRequested, setHintRequested] = React.useState(false)
  const hintOpen = open && hintRequested

  const dismiss = React.useCallback(() => {
    setHintRequested(false)
    onClose()
  }, [onClose])

  const handleNativeInstall = async () => {
    const accepted = await promptInstall()
    if (accepted) dismiss()
  }

  React.useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, dismiss])

  if (!open) return null

  if (hintOpen) {
    return createPortal(
      <div
        role="dialog"
        aria-label="Como instalar no iPhone"
        className="fixed inset-0 z-50 flex flex-col items-center justify-end bg-black/40"
        onClick={dismiss}
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="bg-card text-card-foreground border-border mx-4 max-w-sm rounded-xl border p-4 text-center text-sm shadow-xl">
          Toca em <Share className="text-primary mx-0.5 inline size-4" />{" "}
          <strong>Partilhar</strong> na barra do Safari e depois em{" "}
          <strong>Adicionar ao Ecrã Principal</strong>.
          <p className="text-muted-foreground mt-2 text-xs">
            Toca em qualquer sítio para fechar.
          </p>
        </div>
        <ArrowDown className="text-primary mt-2 size-9 animate-bounce" />
      </div>,
      document.body
    )
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Instalar ScoutBangers"
      className="bg-background/80 fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-sm md:items-center md:p-4"
      onClick={dismiss}
    >
      <div
        className="bg-card text-card-foreground border-border animate-in slide-in-from-bottom md:slide-in-from-bottom-0 md:fade-in flex w-full max-w-md flex-col gap-4 rounded-t-2xl border p-6 shadow-xl duration-200 ease-out md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/icon-header.png"
              alt=""
              className="h-9 w-auto rounded-md"
            />
            <h2 className="text-foreground text-base font-semibold tracking-tight">
              Ainda não instalaste a app?
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            aria-label="Fechar"
          >
            <X />
          </Button>
        </div>

        <p className="text-muted-foreground text-sm leading-relaxed">
          A app funciona muuuito melhor quando está instalada! Instala-a no teu
          ecrã principal para uma experiência mais smooth: abre
          instantaneamente, controla a música no ecrã de
          bloqueio, e funciona melhor offline depois de transferires as
          músicas. Não sabes como instalar? Escolhe o teu sistema e já te explico 🏃.
        </p>

        <div
          role="tablist"
          aria-label="Escolhe o teu sistema"
          className="bg-muted/40 grid grid-cols-2 gap-1 rounded-md p-1"
        >
          <PlatformTab
            active={platform === "ios"}
            onClick={() => setPlatform("ios")}
            icon={<Apple className="size-4" />}
            label="iPhone"
          />
          <PlatformTab
            active={platform === "android"}
            onClick={() => setPlatform("android")}
            icon={<Smartphone className="size-4" />}
            label="Android"
          />
        </div>

        {platform === "android" && canPrompt ? (
          <Button type="button" onClick={handleNativeInstall}>
            <Download />
            Instalar app
          </Button>
        ) : platform === "ios" ? (
          <PlatformInstructions
            icon={<Apple className="size-4" />}
            title="iPhone — Safari"
          >
            <ol className="ml-5 list-decimal space-y-1">
              <li>
                Abre esta app no <strong className="text-foreground">Safari</strong>{" "}
                (não funciona no Chrome do iPhone).
              </li>
              <li>
                Toca no botão{" "}
                <strong className="text-foreground">Partilhar</strong> na barra
                inferior (quadrado com seta para cima).
              </li>
              <li>
                Desliza para baixo e escolhe{" "}
                <strong className="text-foreground">
                  Adicionar ao Ecrã Principal
                </strong>
                .
              </li>
              <li>
                Toca em <strong className="text-foreground">Adicionar</strong>{" "}
                no canto superior direito. O ícone aparece no teu ecrã
                principal.
              </li>
            </ol>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => setHintRequested(true)}
            >
              <ArrowDown />
              Mostrar onde tocar
            </Button>
          </PlatformInstructions>
        ) : (
          <PlatformInstructions
            icon={<Smartphone className="size-4" />}
            title="Android — Chrome ou Brave"
          >
            <ol className="ml-5 list-decimal space-y-1">
              <li>
                Abre o menu do browser (três pontos no canto superior direito).
              </li>
              <li>
                Escolhe{" "}
                <strong className="text-foreground">Instalar app</strong> ou{" "}
                <strong className="text-foreground">
                  Adicionar ao ecrã principal
                </strong>
                .
              </li>
              <li>
                Confirma na janela que aparece. O ícone fica disponível no
                ecrã principal, junto às outras apps.
              </li>
            </ol>
          </PlatformInstructions>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button type="button" onClick={dismiss}>
            Já percebi
          </Button>
          <Button
            type="button"
            variant="ghost"
            asChild
            className="text-muted-foreground hover:text-foreground"
          >
            <Link to="/sobre" onClick={dismiss}>
              Saber mais sobre a app
            </Link>
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}

interface PlatformTabProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function PlatformTab({ active, onClick, icon, label }: PlatformTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring/40 flex items-center justify-center gap-2 rounded-sm py-2 text-sm font-medium transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

interface PlatformInstructionsProps {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}

function PlatformInstructions({
  icon,
  title,
  children,
}: PlatformInstructionsProps) {
  return (
    <div className="border-border bg-background flex flex-col gap-2 rounded-md border p-3 text-sm">
      <div className="text-foreground flex items-center gap-2 font-medium">
        {icon}
        {title}
      </div>
      <div className="text-muted-foreground leading-relaxed">{children}</div>
    </div>
  )
}
