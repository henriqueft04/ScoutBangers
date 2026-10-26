/**
 * Reads the artist and album of an MP3 from its ID3v2 tag, straight out of
 * R2. The tag sits at the start of the file, in frames that each start with
 * a header giving their size, so this reads only the headers it needs and
 * jumps over big frames such as the cover art: a few KB per song instead of
 * the whole file.
 */

export interface TextTags {
  artist?: string
  album?: string
}

/** Bytes per R2 read while walking a tag. */
const WINDOW_BYTES = 16 * 1024
/** Artist and album names are short; anything bigger isn't one. */
const MAX_FRAME_BYTES = 2048

/** Reads byte ranges of one R2 object through a window cache. */
class RangeReader {
  private start = 0
  private bytes = new Uint8Array(0)

  constructor(
    private readonly bucket: R2Bucket,
    private readonly key: string
  ) {}

  async read(offset: number, length: number): Promise<Uint8Array> {
    const end = offset + length
    if (offset < this.start || end > this.start + this.bytes.length) {
      const size = Math.max(WINDOW_BYTES, length)
      const object = await this.bucket.get(this.key, {
        range: { offset, length: size },
      })
      if (!object) throw new Error("object missing")
      this.bytes = new Uint8Array(await object.arrayBuffer())
      this.start = offset
      if (this.bytes.length < length) throw new Error("short read")
    }
    return this.bytes.subarray(offset - this.start, offset - this.start + length)
  }
}

const synchsafe = (b: Uint8Array, at: number) =>
  ((b[at]! & 0x7f) << 21) |
  ((b[at + 1]! & 0x7f) << 14) |
  ((b[at + 2]! & 0x7f) << 7) |
  (b[at + 3]! & 0x7f)

const bigEndian = (b: Uint8Array, at: number, bytes: 3 | 4) =>
  bytes === 3
    ? (b[at]! << 16) | (b[at + 1]! << 8) | b[at + 2]!
    : ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>>
      0

const ENCODINGS = ["iso-8859-1", "utf-16", "utf-16be", "utf-8"]

/** Text of an ID3 text frame: an encoding byte, then the (first) string. */
function decodeText(frame: Uint8Array): string {
  const label = ENCODINGS[frame[0] ?? 0] ?? "iso-8859-1"
  const text = new TextDecoder(label).decode(frame.subarray(1))
  return text.split("\0")[0]!.trim()
}

/**
 * The artist (TPE1) and album (TALB) of the file's ID3v2 tag. An empty
 * object for a file without such a tag (or without those frames); throws if
 * the object can't be read, so the caller can try again later.
 */
export async function readTextTags(
  bucket: R2Bucket,
  key: string
): Promise<TextTags> {
  const reader = new RangeReader(bucket, key)
  const header = await reader.read(0, 10)
  if (String.fromCharCode(header[0]!, header[1]!, header[2]!) !== "ID3") {
    return {}
  }
  const major = header[3]!
  if (major < 2 || major > 4) return {}
  const tagEnd = 10 + synchsafe(header, 6)

  let pos = 10
  // Version 2.3/2.4 may put an extended header before the frames.
  if (major >= 3 && header[5]! & 0x40) {
    const ext = await reader.read(pos, 4)
    pos += major === 4 ? synchsafe(ext, 0) : bigEndian(ext, 0, 4) + 4
  }

  const v22 = major === 2
  const headerLength = v22 ? 6 : 10
  const idLength = v22 ? 3 : 4
  const artistId = v22 ? "TP1" : "TPE1"
  const albumId = v22 ? "TAL" : "TALB"
  const tags: TextTags = {}

  while (pos + headerLength <= tagEnd && !(tags.artist && tags.album)) {
    const frameHeader = await reader.read(pos, headerLength)
    if (frameHeader[0] === 0) break // padding: no more frames
    const id = String.fromCharCode(...frameHeader.subarray(0, idLength))
    const size = v22
      ? bigEndian(frameHeader, 3, 3)
      : major === 4
        ? synchsafe(frameHeader, 4)
        : bigEndian(frameHeader, 4, 4)
    if ((id === artistId || id === albumId) && size >= 2 && size <= MAX_FRAME_BYTES) {
      const text = decodeText(await reader.read(pos + headerLength, size))
      if (text) tags[id === artistId ? "artist" : "album"] = text
    }
    pos += headerLength + size
  }
  return tags
}
