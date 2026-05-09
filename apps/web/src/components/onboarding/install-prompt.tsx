import * as React from "react"
import { createPortal } from "react-dom"
import { Apple, Smartphone, X } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

const SEEN_KEY = "scoutbangers:install-prompt-seen-v1"

type Platform = "ios" | "android"

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "android"
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return "ios"
  return "android"
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  // iOS Safari
  if ((navigator as { standalone?: boolean }).standalone === true) return true
  // Other browsers
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true
  return false
}

/**
 * Aparece na primeira vez que o utilizador abre a app no browser
 * (não quando já está instalada como PWA). Explica como instalar
 * conforme a plataforma e tem um link para a página "Sobre" com
 * instruções mais completas. Conteúdo em português.
 *
 * Persistência: marcamos em localStorage que o utilizador já viu o
 * popup para não voltar a chatear. O botão "Já tenho instalada" e
 * "Mais tarde" produzem o mesmo efeito — desaparece para sempre, e
 * a informação fica disponível em /sobre se quiser rever.
 */
export function InstallPrompt() {
  // Detected synchronously on the first render so the initial
  // selected tab matches the user's device. The effect-driven path
  // would race with the modal becoming visible.
  const [platform, setPlatform] = React.useState<Platform>(detectPlatform)
  const [open, setOpen] = React.useState(false)

  const dismiss = React.useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, "1")
    } catch {
      /* ignore */
    }
    setOpen(false)
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (isStandalone()) return
    if (typeof localStorage === "undefined") return
    try {
      if (localStorage.getItem(SEEN_KEY) === "1") return
    } catch {
      return
    }
    // Pequeno delay para a app carregar primeiro — evita aparecer
    // antes de o utilizador ver sequer o que estamos a propor.
    const timer = setTimeout(() => setOpen(true), 1200)
    return () => clearTimeout(timer)
  }, [])

  React.useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, dismiss])

  if (!open) return null

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
              Instala o ScoutBangers
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
          Instala a app no teu ecrã principal para uma experiência mais
          fluida — abre instantaneamente, controla a música no ecrã de
          bloqueio, e funciona melhor offline depois de transferires as
          músicas.
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

        {platform === "ios" ? (
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
