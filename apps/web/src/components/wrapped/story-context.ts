import * as React from "react"

import type { TransitionKind } from "./transitions"

/** One page of the story. */
export interface SlideDef {
  id: string
  /** How long the slide stays up before auto-advancing, in ms. */
  duration: number
  /** Background and text colour. The background morphs between slides. */
  bg: string
  fg: string
  /** Third colour, for transition effects (shutters, bubbles). */
  accent?: string
  /** How the slide arrives when moving forward. */
  transition?: TransitionKind
  /** The giant word of a "burst" transition. */
  burstWord?: string
  /** Song that plays while this slide is up. */
  soundtrack?: string
  /** Renders this slide's share image (shows the "Partilhar" button). */
  share?: () => Promise<Blob>
  render: () => React.ReactNode
}

export interface StoryControls {
  started: boolean
  /** Start the story — call from a tap so the soundtrack may play. */
  start: () => void
  /** Back to the first slide after the intro. */
  restart: () => void
  close: () => void
  share: () => Promise<void>
  sharing: boolean
  /** Music is audible (not muted, not blocked by the browser). */
  soundOn: boolean
  /** Mute / unmute. Inside a tap it also unblocks the browser's autoplay. */
  toggleSound: () => void
}

export const StoryContext = React.createContext<StoryControls | null>(null)

export function useStory(): StoryControls {
  const ctx = React.useContext(StoryContext)
  if (!ctx) throw new Error("useStory must be used inside <StoryPlayer>")
  return ctx
}
