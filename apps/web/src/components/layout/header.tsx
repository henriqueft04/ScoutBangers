import { Loader2, RefreshCw } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { usePlayer } from "@/hooks/usePlayer"

interface HeaderProps {
  className?: string
}

export function Header({ className }: HeaderProps) {
  const { reload, loading } = usePlayer()
  return (
    <header
      className={cn(
        "border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 border-b backdrop-blur",
        "pt-[env(safe-area-inset-top)]",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-3 py-2 md:px-6 md:py-3">
        <h1 className="flex items-center gap-2">
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
        </h1>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh songs"
          onClick={reload}
          disabled={loading}
          className="touch-manipulation"
        >
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <RefreshCw />
          )}
        </Button>
      </div>
    </header>
  )
}
