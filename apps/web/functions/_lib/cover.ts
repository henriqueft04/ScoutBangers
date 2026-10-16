import { parseBuffer } from "music-metadata"

const AUDIO_BASE_URL = "https://audio.scoutbangers.com"
// Same budget the app uses client-side: tags (and embedded art) sit at the
// front of the file, so a partial read is enough.
const PARTIAL_BYTES = 2 * 1024 * 1024

export interface Cover {
  data: Uint8Array
  type: string
}

/** Reads a song's embedded cover art from R2, or `undefined` if it has none. */
export async function fetchCover(id: string): Promise<Cover | undefined> {
  try {
    const res = await fetch(`${AUDIO_BASE_URL}/${encodeURIComponent(id)}`, {
      headers: { Range: `bytes=0-${PARTIAL_BYTES - 1}` },
    })
    if (!res.ok) return undefined
    const bytes = new Uint8Array(await res.arrayBuffer())
    const metadata = await parseBuffer(bytes, undefined, { skipPostHeaders: true })
    const picture = metadata.common.picture?.[0]
    if (!picture) return undefined
    return { data: picture.data, type: picture.format }
  } catch {
    return undefined
  }
}
