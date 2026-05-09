import type { Song } from "./types"

/**
 * Fetch the song manifest from the serverless function. Throws on non-2xx so
 * callers (notably {@link useSongs}) can surface a user-facing error.
 *
 * Pass `{ bust: true }` to skip Vercel's edge cache when the user explicitly
 * requests a refresh.
 */
export async function fetchSongs(
  options: { bust?: boolean } = {}
): Promise<Song[]> {
  const url = options.bust
    ? `/api/songs?bust=${Date.now()}`
    : "/api/songs"

  const response = await fetch(url, { headers: { Accept: "application/json" } })

  if (!response.ok) {
    // Try to extract a human-readable reason from the server's JSON body.
    let detail: string | null = null
    try {
      const body = (await response.json()) as { error?: string; detail?: string }
      detail = body.error ?? body.detail ?? null
    } catch {
      /* response wasn't JSON */
    }
    throw new Error(
      detail ??
        `Falha ao carregar as músicas (${response.status} ${response.statusText})`
    )
  }

  const data = (await response.json()) as Song[]
  return data
}
