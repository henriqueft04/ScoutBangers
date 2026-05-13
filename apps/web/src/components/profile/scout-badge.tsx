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

  const topLine = [regiao, nucleo].filter(Boolean).join(" · ")
  const agrupamento = agrupamentoNumero
    ? `Agr. ${agrupamentoNumero}${agrupamentoNome ? ` ${agrupamentoNome}` : ""}`
    : null

  return (
    <div
      className={cn(
        "text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs",
        className
      )}
    >
      <MapPin className="size-3.5 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-col">
        {topLine ? <p className="truncate">{topLine}</p> : null}
        {agrupamento ? <p className="truncate">{agrupamento}</p> : null}
      </div>
    </div>
  )
}
