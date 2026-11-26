import * as React from "react"

import { useAuth } from "./useAuth"
import { usePlayer } from "./usePlayer"
import { buildWrapped, fetchWrapped, type Wrapped, type WrappedRaw } from "@/lib/wrapped"

interface UseWrappedResult {
  data: Wrapped | null
  loading: boolean
  error: string | null
  retry: () => void
}

interface Result {
  /** Which request this answers — loading is "no result for the current key". */
  key: string
  raw: WrappedRaw | null
  error: string | null
}

/**
 * The signed-in user's Wrapped for `year`, joined to the loaded catalog.
 * `mock` (dev builds only) skips the RPC and invents one from the catalog.
 */
export function useWrapped(
  year: number,
  enabled = true,
  mock = false
): UseWrappedResult {
  const { user } = useAuth()
  const { songs, loading: catalogLoading } = usePlayer()
  const [attempt, setAttempt] = React.useState(0)
  const [result, setResult] = React.useState<Result | null>(null)
  const uid = user?.id ?? null
  const key = `${uid}:${year}:${attempt}:${mock}`
  const useMock = mock && import.meta.env.DEV
  const ready = enabled && (Boolean(uid) || useMock)
  const catalogReady = songs.length > 0

  React.useEffect(() => {
    if (!enabled) return
    if (useMock) {
      if (!catalogReady) return
      let cancelled = false
      void import("@/lib/wrapped-mock").then(({ mockWrappedRaw }) => {
        if (!cancelled) setResult({ key, raw: mockWrappedRaw(songs, year), error: null })
      })
      return () => {
        cancelled = true
      }
    }
    if (!uid) return
    let cancelled = false
    fetchWrapped(uid, year, { fresh: attempt > 0 }).then(
      (raw) => {
        if (!cancelled) setResult({ key, raw, error: null })
      },
      (err: unknown) => {
        if (!cancelled)
          setResult({
            key,
            raw: null,
            error:
              err instanceof Error ? err.message : "Não foi possível carregar o teu Wrapped.",
          })
      }
    )
    return () => {
      cancelled = true
    }
    // `songs` only feeds the mock, once: catalogReady gates it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, year, enabled, attempt, key, useMock, catalogReady])

  const current = result?.key === key ? result : null
  const raw = current?.raw ?? null
  const data = React.useMemo(
    () => (raw ? buildWrapped(raw, songs) : null),
    [raw, songs]
  )

  return {
    data,
    loading:
      ready &&
      // The catalog joins titles: wait for it, or the song slides come out empty.
      (!current || (raw !== null && catalogLoading && songs.length === 0)),
    error: current?.error ?? null,
    retry: () => setAttempt((a) => a + 1),
  }
}
