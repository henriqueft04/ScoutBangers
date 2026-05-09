import { ListMusic } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { usePlayer } from "@/hooks/usePlayer"

interface QueueToggleButtonProps {
  open: boolean
  onClick: () => void
  className?: string
  /** Tailwind size token — different between the mobile action row
   *  (size-11) and the desktop volume cluster (size-10). */
  sizeClass?: string
  /** Icon size — defaults match the button size token. */
  iconClass?: string
}

/**
 * Queue button used in two places in the fullscreen player (mobile
 * action row, desktop next-to-volume row). Renders the music icon plus
 * a small badge with the user-queue count.
 */
export function QueueToggleButton({
  open,
  onClick,
  className,
  sizeClass = "size-11",
  iconClass = "size-5",
}: QueueToggleButtonProps) {
  const { userQueue } = usePlayer()
  const count = userQueue.length
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={open ? "Fechar fila" : "Abrir fila"}
      aria-pressed={open}
      onClick={onClick}
      className={cn(
        "touch-manipulation relative shrink-0",
        sizeClass,
        className
      )}
    >
      <ListMusic className={iconClass} />
      {count > 0 ? (
        <span className="bg-primary text-primary-foreground absolute -right-0.5 -top-0.5 inline-flex size-4 items-center justify-center rounded-full text-[10px] font-bold">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Button>
  )
}
