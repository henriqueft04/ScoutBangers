import * as React from "react"

import { subscribeToAnyMetadata } from "@/lib/track-metadata"

/**
 * Returns a number that increments whenever any song's metadata lands in the
 * cache. Use as a memo dependency in hooks that aggregate metadata across
 * many songs (search filter, sort, artist list) so they re-compute when new
 * tags become available in the background.
 */
export function useAllMetadataVersion(): number {
  return React.useSyncExternalStore(
    subscribeToAnyMetadata,
    () => version,
    () => 0
  )
}

let version = 0
subscribeToAnyMetadata(() => {
  version += 1
})
