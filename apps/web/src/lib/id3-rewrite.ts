import { ID3Writer } from "browser-id3-writer"
import { parseBuffer } from "music-metadata"

export interface EditableTags {
  title: string
  artist: string
  album: string
  year: string
  genre: string
}

export interface ParsedSong {
  tags: EditableTags
  cover?: { data: Uint8Array; mimeType: string }
}

interface NativeTag {
  id: string
  value: unknown
}

/** Frames the editor owns; everything else is carried over untouched. */
const OWNED = new Set(["TIT2", "TPE1", "TALB", "TYER", "TDRC", "TCON", "APIC"])

const NUMBER_FRAMES = new Set(["TLEN", "TBPM", "TYER"])
const ARRAY_FRAMES = new Set(["TPE1", "TPE3", "TCOM", "TCON"])

function id3Frames(native: Record<string, NativeTag[]>): NativeTag[] {
  const key = Object.keys(native).find((k) => k.startsWith("ID3v2"))
  return key ? native[key] : []
}

function sniffImage(data: Uint8Array): string | null {
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e) return "image/png"
  if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg"
  return null
}

export async function parseSong(buffer: ArrayBuffer): Promise<ParsedSong> {
  const meta = await parseBuffer(new Uint8Array(buffer), { mimeType: "audio/mpeg" })
  const c = meta.common
  const pic = c.picture?.[0]
  return {
    tags: {
      title: c.title ?? "",
      artist: c.artist ?? "",
      album: c.album ?? "",
      year: c.year ? String(c.year) : "",
      genre: c.genre?.join(", ") ?? "",
    },
    cover: pic ? { data: pic.data, mimeType: pic.format } : undefined,
  }
}

/**
 * Rewrites the ID3 tag of an MP3. `browser-id3-writer` drops the whole
 * existing tag, so frames the editor doesn't touch (lyrics, track number,
 * TLEN — which the app relies on for exact durations — etc.) are re-read
 * with music-metadata and written back. The audio frames are not touched.
 *
 * `cover`: `undefined` keeps the existing cover, a value replaces it.
 */
export async function rewriteTags(
  buffer: ArrayBuffer,
  edits: EditableTags,
  cover?: { data: ArrayBuffer; mimeType: "image/jpeg" | "image/png" }
): Promise<ArrayBuffer> {
  const meta = await parseBuffer(new Uint8Array(buffer), { mimeType: "audio/mpeg" })
  const frames = id3Frames(meta.native as Record<string, NativeTag[]>)

  const writer = new (ID3Writer as unknown as new (b: ArrayBuffer) => {
    setFrame(id: string, value: unknown): unknown
    addTag(): void
    arrayBuffer: ArrayBuffer
  })(buffer)

  // Carry over untouched frames. Anything the writer can't express is
  // skipped rather than failing the whole save.
  for (const { id, value } of frames) {
    const frameId = id.split(":")[0]
    if (OWNED.has(frameId)) continue
    try {
      if (frameId === "TXXX") {
        // music-metadata reports `TXXX:<description>` with a string value.
        const desc = id.includes(":") ? id.slice(id.indexOf(":") + 1) : ""
        const v = value as { description?: string; text?: string } | string
        const text = typeof v === "string" ? v : (v?.text ?? "")
        const description = typeof v === "string" ? desc : (v?.description ?? desc)
        if (text) writer.setFrame("TXXX", { description, value: text })
      } else if ((frameId === "USLT" || frameId === "COMM") && value && typeof value === "object") {
        const v = value as { description?: string; text?: string; language?: string }
        if (frameId === "USLT") {
          writer.setFrame("USLT", {
            description: v.description ?? "",
            lyrics: v.text ?? "",
            language: v.language || "eng",
          })
        } else {
          writer.setFrame("COMM", {
            description: v.description ?? "",
            text: v.text ?? "",
            language: v.language || "eng",
          })
        }
      } else if (/^T[A-Z0-9]{3}$/.test(frameId) && frameId !== "TXXX") {
        const text = Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "")
        if (!text) continue
        if (NUMBER_FRAMES.has(frameId)) {
          const n = Number.parseInt(text, 10)
          if (Number.isFinite(n)) writer.setFrame(frameId, n)
        } else if (ARRAY_FRAMES.has(frameId)) {
          writer.setFrame(frameId, [text])
        } else {
          writer.setFrame(frameId, text)
        }
      }
    } catch {
      /* unsupported frame: drop it */
    }
  }

  const title = edits.title.trim()
  const artist = edits.artist.trim()
  const album = edits.album.trim()
  const year = Number.parseInt(edits.year, 10)
  const genres = edits.genre
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean)
  if (title) writer.setFrame("TIT2", title)
  if (artist) writer.setFrame("TPE1", [artist])
  if (album) writer.setFrame("TALB", album)
  if (Number.isFinite(year)) writer.setFrame("TYER", year)
  if (genres.length) writer.setFrame("TCON", genres)

  const existing = meta.common.picture?.[0]
  const existingMime = existing ? sniffImage(existing.data) : null
  const pic = cover
    ? { data: cover.data, mimeType: cover.mimeType }
    : existing && existingMime
      ? {
          data: existing.data.buffer.slice(
            existing.data.byteOffset,
            existing.data.byteOffset + existing.data.byteLength
          ) as ArrayBuffer,
          mimeType: existingMime,
        }
      : null
  if (pic) {
    writer.setFrame("APIC", {
      type: 3,
      data: pic.data,
      description: "Cover",
      mimeType: pic.mimeType,
      useUnicodeEncoding: false,
    })
  }

  writer.addTag()
  return writer.arrayBuffer
}

/** Re-encodes any browser-decodable image (AVIF, WebP, …) as a ≤1000px JPEG. */
export async function toJpegCover(
  file: Blob
): Promise<{ data: ArrayBuffer; mimeType: "image/jpeg" }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9)
  )
  if (!blob) throw new Error("Não foi possível processar a imagem.")
  return { data: await blob.arrayBuffer(), mimeType: "image/jpeg" }
}
