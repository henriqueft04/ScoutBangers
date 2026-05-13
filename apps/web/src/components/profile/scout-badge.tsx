import { MapPin } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

interface ScoutBadgeProps {
  regiao: string | null
  nucleo: string | null
  agrupamentoNumero: number | null
  agrupamentoNome: string | null
  className?: string
}

/**
 * Single-line display of a user's scout identity (Região · Núcleo ·
 * Agrupamento). Returns null when no fields are set so callers can
 * simply drop it in.
 */
export function ScoutBadge({
  regiao,
  nucleo,
  agrupamentoNumero,
  agrupamentoNome,
  className,
}: ScoutBadgeProps) {
  if (!regiao && !agrupamentoNumero && !agrupamentoNome) return null

  const parts = [
    regiao,
    nucleo,
    agrupamentoNumero
      ? `Agr. ${agrupamentoNumero}${agrupamentoNome ? ` ${agrupamentoNome}` : ""}`
      : null,
  ].filter(Boolean) as string[]

  return (
    <p
      className={cn(
        "text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-xs",
        className
      )}
    >
      <MapPin className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{parts.join(" · ")}</span>
    </p>
  )
}
