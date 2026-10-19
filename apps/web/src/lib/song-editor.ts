import { supabase } from "./supabase"
import {
  parseSong,
  rewriteTags,
  toJpegCover,
  type EditableTags,
  type ParsedSong,
} from "./id3-rewrite"

export interface LoadedSong {
  parsed: ParsedSong
  /** Drive modifiedTime when the editor opened; the save refuses if it moved. */
  baseModifiedTime: string
  fileName: string
}

/** Tags (and cover) sit at the front of the file; no need for the whole song. */
const PREVIEW_BYTES = 3 * 1024 * 1024

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) throw new Error("Sessão indisponível.")
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Sessão expirada.")
  return { Authorization: `Bearer ${token}` }
}

async function errorFrom(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body.error) return new Error(body.error)
  } catch {
    /* ignore */
  }
  return new Error(`Erro ${res.status}`)
}

async function fetchSongBytes(id: string, range?: string): Promise<Response> {
  const res = await fetch(`/api/song-file/${encodeURIComponent(id)}`, {
    headers: { ...(await authHeader()), ...(range ? { Range: range } : {}) },
  })
  if (!res.ok) throw await errorFrom(res)
  // A dev server without the Pages Functions answers with the SPA's HTML.
  if (res.headers.get("Content-Type")?.includes("text/html")) {
    throw new Error("A API não está disponível (a resposta não é áudio).")
  }
  return res
}

function isEmpty(parsed: ParsedSong): boolean {
  const t = parsed.tags
  return !t.title && !t.artist && !t.album && !t.year && !t.genre && !parsed.cover
}

/**
 * Opens the editor: fetches only the start of the file to read its tags,
 * and falls back to the whole file if that comes back empty or unparseable
 * (e.g. an unusually large tag that the first few MB don't fully contain).
 */
export async function loadSong(id: string): Promise<LoadedSong> {
  let res = await fetchSongBytes(id, `bytes=0-${PREVIEW_BYTES - 1}`)
  let parsed: ParsedSong | null = null
  try {
    parsed = await parseSong(await res.arrayBuffer())
  } catch (error) {
    console.warn("[song-editor] partial parse failed, loading full file", error)
  }
  if (!parsed || isEmpty(parsed)) {
    res = await fetchSongBytes(id)
    parsed = await parseSong(await res.arrayBuffer())
  }

  const fileName = decodeURIComponent(res.headers.get("X-Drive-Name") ?? "")
  // The app lists songs by their Drive file name, so use it when the file
  // has no title tag of its own.
  if (!parsed.tags.title) {
    parsed.tags.title = fileName.replace(/\.mp3$/i, "")
  }
  return {
    parsed,
    baseModifiedTime: res.headers.get("X-Drive-Modified-Time") ?? "",
    fileName,
  }
}

export interface SaveResult {
  name: string
  modifiedTime: string
  synced: boolean
}

/**
 * Rewrites the tags and replaces the Drive file's content in place (same
 * file ID → play counts, favourites and playlists are preserved). The
 * Drive file name follows the title, since that's what the app lists.
 */
export async function saveSong(
  id: string,
  loaded: LoadedSong,
  edits: EditableTags,
  newCover?: File
): Promise<SaveResult> {
  const cover = newCover ? await toJpegCover(newCover) : undefined

  // The whole file is only needed now, to rewrite its tag.
  const full = await fetchSongBytes(id)
  const driveModified = full.headers.get("X-Drive-Modified-Time") ?? ""
  if (driveModified !== loaded.baseModifiedTime) {
    throw new Error("A música foi alterada entretanto. Fecha e volta a abrir o editor.")
  }
  const bytes = await rewriteTags(await full.arrayBuffer(), edits, cover)

  const title = edits.title.trim()
  const headers: Record<string, string> = {
    ...(await authHeader()),
    "Content-Type": "audio/mpeg",
    "X-Base-Modified-Time": driveModified,
  }
  if (title && `${title}.mp3` !== loaded.fileName) {
    headers["X-Song-Name"] = encodeURIComponent(title)
  }

  const res = await fetch(`/api/song-file/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers,
    body: bytes,
  })
  if (!res.ok) throw await errorFrom(res)
  return (await res.json()) as SaveResult
}
