import * as React from "react"
import { Check, MonitorSpeaker, Smartphone } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { useConnect } from "@/hooks/useConnect"

interface DeviceButtonProps {
  className?: string
}

const isPhone = (name: string) => /iPhone|iPad|Android/.test(name)

/**
 * Picks which of the account's devices plays. Shows up once a second device
 * is signed in, and turns primary while the sound is coming from another one.
 */
export function DeviceButton({ className }: DeviceButtonProps) {
  const { status, devices, you, activeId, outputElsewhere, transferTo } = useConnect()
  const [open, setOpen] = React.useState(false)

  if (status !== "live" || devices.length < 2) return null

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Escolher dispositivo"
        aria-pressed={outputElsewhere}
        onClick={() => setOpen(true)}
        data-tour-id="player-devices"
        className={cn(className, outputElsewhere && "text-primary")}
      >
        <MonitorSpeaker className="size-5" />
      </Button>
      <BottomSheet open={open} title="Reproduzir em" onClose={() => setOpen(false)}>
        <ul className="flex flex-col gap-1">
          {devices.map((device) => {
            const Icon = isPhone(device.name) ? Smartphone : MonitorSpeaker
            const playing = device.id === activeId
            return (
              <li key={device.id}>
                <button
                  type="button"
                  onClick={() => {
                    transferTo(device.id)
                    setOpen(false)
                  }}
                  className={cn(
                    "hover:bg-accent touch-manipulation flex w-full items-center gap-3 rounded-md px-3 py-3 text-left",
                    playing && "text-primary"
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {device.name}
                    {device.id === you ? (
                      <span className="text-muted-foreground"> (este dispositivo)</span>
                    ) : null}
                  </span>
                  {playing ? <Check className="size-4 shrink-0" /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      </BottomSheet>
    </>
  )
}
