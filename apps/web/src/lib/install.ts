import * as React from "react"

const INSTALLED_KEY = "scoutbangers:installed-v1"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  // iOS Safari
  if ((navigator as { standalone?: boolean }).standalone === true) return true
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false
}

function readInstalledFlag(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1"
  } catch {
    return false
  }
}

function markInstalled() {
  try {
    localStorage.setItem(INSTALLED_KEY, "1")
  } catch {
    /* ignore */
  }
}

interface InstallSnapshot {
  installed: boolean
  canPrompt: boolean
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = isStandalone() || readInstalledFlag()
if (installed) markInstalled()
let snapshot: InstallSnapshot = { installed, canPrompt: false }
const listeners = new Set<() => void>()

function emit() {
  snapshot = { installed, canPrompt: deferred !== null }
  listeners.forEach((l) => l())
}

// Registered at module load: Chrome can fire `beforeinstallprompt` before
// React mounts, and it only fires once per page load.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    installed = true
    markInstalled()
    emit()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Triggers the native install dialog. Returns false when the browser
 * hasn't offered one (iOS, already installed, Chrome cooldown), so the
 * caller can fall back to manual instructions.
 */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  emit()
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome === "accepted"
  } catch {
    return false
  }
}

export function useInstall(): InstallSnapshot {
  return React.useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot
  )
}
