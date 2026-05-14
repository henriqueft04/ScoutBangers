import * as React from "react"

/**
 * Where the tooltip card should sit relative to the target rect.
 * "auto" lets the engine pick whichever side has the most room — use
 * an explicit side when the auto pick clashes with the layout (e.g.
 * a target near the screen edge whose card would clip).
 */
export type TourSide = "top" | "bottom" | "left" | "right" | "auto"

/**
 * Declarative step definition. Steps are pure data so adding /
 * removing tour content never touches the engine.
 *
 *  - `target`: CSS selector for the anchor element. `null` renders a
 *    centered welcome card without a spotlight cutout.
 *  - `route`: when set, the engine navigates here before the step
 *    renders and waits for the target to mount (MutationObserver) so
 *    cross-page steps work without timing hacks.
 *  - `advanceOn`: how the user moves forward. `"next"` (default) shows
 *    a button; `"click"` waits for the target to be tapped.
 */
export interface TourStep {
  id: string
  target: string | null
  route?: string
  title: string
  body: string
  side?: TourSide
  advanceOn?: "next" | "click"
  /**
   * Where to navigate when the user advances past this step (Next
   * button or click-to-advance). Use a string for a static
   * destination, or a function that resolves dynamically — the
   * function is called at advance time so it can query the DOM (e.g.
   * pick the first friend link currently rendered). Return null /
   * undefined to skip the navigation.
   *
   * The next step's own `route` is still applied afterwards, so
   * configure routes deliberately to avoid double navigation flashes.
   */
  nextRoute?: string | (() => string | null | undefined)
  /**
   * Side effect to run when the user advances past this step. Used
   * to programmatically click DOM elements that aren't navigations
   * — e.g. opening the fullscreen player by dispatching a click on
   * the expand button so the next step can highlight a control
   * that's only mounted while fullscreen is open. Runs BEFORE the
   * step index updates and BEFORE `nextRoute` navigation, so the
   * side-effect can change the DOM in a way the next step depends
   * on.
   */
  onAdvance?: () => void
  /**
   * Side effect to run when this step BECOMES active. Used to clean
   * up state left behind by a previous step — e.g. closing the
   * lyrics panel before the queue step shows, so the queue button
   * isn't visually obscured by the still-open lyrics sheet.
   */
  onEnter?: () => void
}

export interface TourContextValue {
  activeTourId: string | null
  stepIndex: number
  currentStep: TourStep | null
  totalSteps: number
  start: (tourId: string) => void
  next: () => void
  prev: () => void
  skip: () => void
  complete: () => void
  /** True when the user has finished or skipped the main tour. */
  hasSeenTour: boolean
}

export const TourContext = React.createContext<TourContextValue | null>(null)
