/**
 * Magic-byte sniffing for the audio containers ScoutBangers serves.
 *
 * Why this exists: the declared `Content-Type` for a song can be wrong —
 * Google Drive's `alt=media` download endpoint sometimes serves a generic
 * `application/octet-stream` regardless of the file's real (correct)
 * mimeType, and that value gets baked into the R2 object's headers, and
 * from there into any cached download's `Blob`. Streaming playback
 * tolerates this (browsers sniff bytes for a network `<audio src>`), but
 * Safari/WebKit trusts a `Blob`'s declared `type` strictly when deciding
 * whether it can decode it — a wrong type reliably produces "formato não
 * suportado" even though the bytes are perfectly fine. Sniffing the first
 * few bytes ourselves gives us a source of truth that's independent of
 * any upstream header, so a downloaded song's cached type is correct even
 * if the server-side type never gets fixed.
 */

const asciiBytes = (s: string): number[] => Array.from(s).map((c) => c.charCodeAt(0))

function matches(bytes: Uint8Array, offset: number, sig: number[]): boolean {
  if (bytes.length < offset + sig.length) return false
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false
  }
  return true
}

const ID3 = asciiBytes("ID3")
const FLAC = asciiBytes("fLaC")
const OGGS = asciiBytes("OggS")
const RIFF = asciiBytes("RIFF")
const WAVE = asciiBytes("WAVE")
const FTYP = asciiBytes("ftyp")

/**
 * Identify an audio container from its leading bytes. Returns `null` when
 * nothing recognisable matches — callers should fall back to whatever
 * Content-Type they already have rather than treat this as authoritative
 * proof of an unsupported format (plenty of valid containers aren't
 * covered here).
 */
export function sniffAudioMimeType(bytes: Uint8Array): string | null {
  if (matches(bytes, 0, ID3)) return "audio/mpeg"
  if (matches(bytes, 0, FLAC)) return "audio/flac"
  if (matches(bytes, 0, OGGS)) return "audio/ogg"
  if (matches(bytes, 0, RIFF) && matches(bytes, 8, WAVE)) return "audio/wav"
  if (matches(bytes, 4, FTYP)) return "audio/mp4"
  // Tagless MPEG audio: an 11-bit frame sync (0xFFE0..0xFFFF) at the very
  // start of the file. Common for files with no ID3v2 header.
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) {
    return "audio/mpeg"
  }
  return null
}

/** Concatenate the leading `n` bytes across a list of chunks. */
export function firstBytes(chunks: Uint8Array[], n: number): Uint8Array {
  const out = new Uint8Array(n)
  let offset = 0
  for (const chunk of chunks) {
    if (offset >= n) break
    const take = Math.min(chunk.length, n - offset)
    out.set(chunk.subarray(0, take), offset)
    offset += take
  }
  return out.subarray(0, offset)
}
