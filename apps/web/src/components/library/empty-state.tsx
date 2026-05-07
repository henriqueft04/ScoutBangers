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
    title: "Loading songs",
    subtitle: "Pulling the freshest tracks from the drive…",
    Icon: Loader2,
  },
  empty: {
    title: "No songs yet",
    subtitle: "Drop some MP3s into the Drive folder and refresh.",
    Icon: Music,
  },
  error: {
    title: "Could not load songs",
    subtitle: "Check your connection and try refreshing.",
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
