import { CircleAlert, Loader2, Music } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

interface EmptyStateProps {
  variant: "loading" | "empty" | "error"
  message?: string
  className?: string
}

const COPY: Record<
  EmptyStateProps["variant"],
  { title: string; subtitle: string; Icon: typeof Music }
> = {
  loading: {
    title: "A carregar músicas",
    subtitle: "A buscar as faixas mais recentes da drive…",
    Icon: Loader2,
  },
  empty: {
    title: "Ainda não há músicas",
    subtitle: "Mete uns MP3 na pasta da Drive e atualiza.",
    Icon: Music,
  },
  error: {
    title: "Não foi possível carregar as músicas",
    subtitle: "Verifica a tua ligação e tenta atualizar.",
    Icon: CircleAlert,
  },
}

export function EmptyState({ variant, message, className }: EmptyStateProps) {
  const { title, subtitle, Icon } = COPY[variant]
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "text-muted-foreground flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className
      )}
    >
      <Icon
        className={cn("size-8", variant === "loading" && "animate-spin")}
      />
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">{title}</p>
        <p className="text-xs">{message ?? subtitle}</p>
      </div>
    </div>
  )
}
