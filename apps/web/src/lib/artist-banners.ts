import { apiErrorMessage } from "./api-error"
import { getAccessToken } from "./auth-token"
import { normalizeText } from "./normalize"
import { supabase } from "./supabase"

/** Banner size: the golden-ratio frame playlist covers use. */
export const ARTIST_BANNER_WIDTH = 1200
export const ARTIST_BANNER_HEIGHT = 742

/** How artists are told apart: accent- and case-insensitive (as in the API). */
export const artistKey = (name: string) => normalizeText(name.trim())

const approved = new Map<string, string | null>()

/** The approved banner of an artist, or null when there is none. */
export async function fetchArtistBanner(name: string): Promise<string | null> {
  const key = artistKey(name)
  const known = approved.get(key)
  if (known !== undefined) return known
  if (!supabase) return null
  const { data, error } = await supabase
    .from("artist_banners")
    .select("banner_url")
    .eq("artist_key", key)
    .maybeSingle()
  if (error) return null
  const url = data?.banner_url ?? null
  approved.set(key, url)
  return url
}

/**
 * Suggests a banner for an artist: opens a suggestion, then uploads the
 * image to it. It only goes live once an admin approves it.
 */
export async function suggestArtistBanner(
  artistName: string,
  image: Blob
): Promise<void> {
  if (!supabase) throw new Error("Sessão indisponível.")
  const { data: id, error } = await supabase.rpc("submit_artist_banner", {
    artist_name: artistName,
  })
  if (error || !id) {
    const reason = error?.message ?? ""
    throw new Error(
      reason.includes("waiting")
        ? "Já tens 3 sugestões à espera de aprovação."
        : reason.includes("today")
          ? "Atingiste o limite de sugestões por hoje."
          : "Não foi possível enviar a sugestão."
    )
  }
  const response = await fetch(
    `/api/artist-banners/upload?id=${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "image/jpeg",
        Authorization: `Bearer ${await getAccessToken()}`,
      },
      body: image,
    }
  )
  if (!response.ok) throw new Error(await apiErrorMessage(response))
}

export interface PendingBanner {
  id: string
  artistName: string
  createdAt: string
  imageUrl: string
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`/api/artist-banners/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
  })
  if (!response.ok) throw new Error(await apiErrorMessage(response))
  return response
}

/** Admin: the suggestions waiting for a decision. */
export async function listPendingBanners(): Promise<PendingBanner[]> {
  return (await (await adminFetch("pending")).json()) as PendingBanner[]
}

/** Admin: approve or reject a suggestion. */
export async function decideBanner(
  id: string,
  decision: "approve" | "reject"
): Promise<void> {
  await adminFetch(`${encodeURIComponent(id)}/${decision}`, { method: "POST" })
  // An approval changes what an artist page shows.
  approved.clear()
}
