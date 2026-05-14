import * as React from "react"

import {
  TourContext,
  type TourContextValue,
} from "@/components/tour/tour-context"

/** Read tour state and actions inside any descendant of `<TourProvider>`. */
export function useTour(): TourContextValue {
  const ctx = React.useContext(TourContext)
  if (ctx === null) {
    throw new Error("useTour must be used within a <TourProvider>")
  }
  return ctx
}
