import * as React from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/lib/supabase"

import {
  TourContext,
  type TourContextValue,
  type TourStep,
} from "./tour-context"
import { TOURS } from "./tour-steps"
import { TourOverlay } from "./tour-overlay"

const CACHE_KEY = (userId: string) => `scoutbangers:tour-seen:${userId}`
/**
 * Delay before the auto-start tour begins after the user lands on the
 * app. Gives lazy chunks + the initial fetch a chance to settle so the
 * first highlighted target isn't mid-layout when we measure it.
 */
const AUTO_START_DELAY_MS = 1200

/**
 * Top-level provider that owns tour state, runs the auto-start logic
 * on first login, and persists completion to the profile row.
 *
 * Mount this INSIDE `<BrowserRouter>` + `<AuthProvider>` so it can
 * call `useNavigate` and read the current user. The overlay renders
 * here too — keeping it co-located with state means the rest of the
 * app doesn't need to know the tour exists unless it's tagging an
 * element with `data-tour-id`.
 */
export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [activeTourId, setActiveTourId] = React.useState<string | null>(null)
  const [stepIndex, setStepIndex] = React.useState(0)
  /**
   * `hasSeenTour` is true when the profile records a completion OR the
   * localStorage cache says so. The cache exists purely so a refresh
   * after completing doesn't flash the tour again while the Supabase
   * row loads.
   */
  const [hasSeenTour, setHasSeenTour] = React.useState(false)
  /** Guards the auto-start effect so it only fires once per session. */
  const autoStartedRef = React.useRef(false)

  // Hydrate `hasSeenTour` from the localStorage cache before profile
  // loads — prevents a tour-flash on a refresh after completion.
  React.useEffect(() => {
    if (!user) return
    try {
      if (localStorage.getItem(CACHE_KEY(user.id)) === "1") {
        setHasSeenTour(true)
      }
    } catch {
      /* private mode / quota — best-effort */
    }
  }, [user])

  // Reconcile with the profile row once it's loaded. The profile is
  // the source of truth (so the tour follows the user across devices);
  // the cache just hides startup flicker.
  React.useEffect(() => {
    if (!profile) return
    const seen = profile.tour_completed_at !== null
    setHasSeenTour(seen)
    if (seen && user) {
      try {
        localStorage.setItem(CACHE_KEY(user.id), "1")
      } catch {
        /* ignore */
      }
    }
  }, [profile, user])

  // Auto-start: first login (profile loaded + tour_completed_at null).
  // Gated by autoStartedRef so re-renders (or temporary profile
  // re-fetches) don't restart the tour.
  React.useEffect(() => {
    if (autoStartedRef.current) return
    if (!user || !profile) return
    if (profile.tour_completed_at !== null) return
    autoStartedRef.current = true
    const timer = window.setTimeout(() => {
      setActiveTourId("main")
      setStepIndex(0)
    }, AUTO_START_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [user, profile])

  const steps: TourStep[] = React.useMemo(
    () => (activeTourId ? TOURS[activeTourId] ?? [] : []),
    [activeTourId]
  )
  const currentStep = steps[stepIndex] ?? null

  // Fire each step's `onEnter` once when the step becomes active. Used
  // to clean up app state from the previous step (e.g. close the
  // lyrics sheet before the queue step appears) so the new step
  // renders against the DOM it expects. Keyed on step id so re-renders
  // of the same step don't re-trigger.
  const lastEnteredIdRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!currentStep) {
      lastEnteredIdRef.current = null
      return
    }
    if (lastEnteredIdRef.current === currentStep.id) return
    lastEnteredIdRef.current = currentStep.id
    if (currentStep.onEnter) {
      try {
        currentStep.onEnter()
      } catch {
        /* side-effect failures shouldn't block the tour */
      }
    }
  }, [currentStep])

  // Navigate to the step's route BEFORE the overlay measures the
  // target. The overlay's MutationObserver then waits for the
  // `data-tour-id` element to appear in the DOM, so suspended pages
  // (React.lazy) work without extra plumbing.
  React.useEffect(() => {
    if (!currentStep || !currentStep.route) return
    if (location.pathname === currentStep.route) return
    navigate(currentStep.route)
    // location is read once at effect-fire time — re-navigating on
    // every location change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, navigate])

  const recordCompletion = React.useCallback(async () => {
    if (!user) return
    try {
      localStorage.setItem(CACHE_KEY(user.id), "1")
    } catch {
      /* ignore */
    }
    if (!supabase) return
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ tour_completed_at: new Date().toISOString() })
        .eq("id", user.id)
      if (!error) {
        await refreshProfile()
      }
    } catch {
      /* network failure — the cache key still hides re-trigger this
         session; we'll retry on next completion. */
    }
  }, [user, refreshProfile])

  // Single "tour is over" path used by skip, complete, and the
  // last-step branch of next. All three end the same way (clear active
  // tour, reset index, mark seen, persist) so they share this helper
  // instead of repeating the four lines.
  const finishTour = React.useCallback(() => {
    setActiveTourId(null)
    setStepIndex(0)
    setHasSeenTour(true)
    void recordCompletion()
  }, [recordCompletion])

  const start = React.useCallback((tourId: string) => {
    if (!TOURS[tourId]) return
    autoStartedRef.current = true
    setActiveTourId(tourId)
    setStepIndex(0)
  }, [])

  const next = React.useCallback(() => {
    // Side effect first — onAdvance may need to open something
    // (fullscreen sheet, dialog) that the NEXT step's target lives
    // inside. Running it before the state update means the new step
    // renders against a DOM that already has the dependency mounted.
    if (currentStep?.onAdvance) {
      try {
        currentStep.onAdvance()
      } catch {
        /* side-effect failures shouldn't block the tour */
      }
    }
    // Run the current step's nextRoute (if any) before advancing so
    // the destination matches the user's "I clicked Next, take me
    // there" mental model. Function resolvers run at click time so
    // they can read the current DOM (e.g. pick whichever friend link
    // is on screen).
    if (currentStep?.nextRoute) {
      const dest =
        typeof currentStep.nextRoute === "function"
          ? currentStep.nextRoute()
          : currentStep.nextRoute
      if (dest && dest !== location.pathname) {
        navigate(dest)
      }
    }
    setStepIndex((i) => {
      if (i + 1 >= steps.length) {
        finishTour()
        return 0
      }
      return i + 1
    })
  }, [
    currentStep,
    steps.length,
    finishTour,
    navigate,
    location.pathname,
  ])

  const prev = React.useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1))
  }, [])

  // skip and complete are kept as distinct names in the public API —
  // call sites read more naturally with the right verb — but they
  // share the same behavior, so both just delegate.
  const skip = finishTour
  const complete = finishTour

  const value = React.useMemo<TourContextValue>(
    () => ({
      activeTourId,
      stepIndex,
      currentStep,
      totalSteps: steps.length,
      start,
      next,
      prev,
      skip,
      complete,
      hasSeenTour,
    }),
    [
      activeTourId,
      stepIndex,
      currentStep,
      steps.length,
      start,
      next,
      prev,
      skip,
      complete,
      hasSeenTour,
    ]
  )

  return (
    <TourContext.Provider value={value}>
      {children}
      {activeTourId && currentStep ? <TourOverlay step={currentStep} /> : null}
    </TourContext.Provider>
  )
}
