/**
 * Perceptual fingerprint of a cover, so songs whose artwork looks the same
 * can be told apart from different ones even when the embedded files differ
 * byte for byte (re-encoded, different tagger, different size).
 *
 * A difference hash (dHash): the image shrunk to 9×8 greyscale, one bit per
 * pixel for "brighter than its right neighbour". Plus the mean colour, so
 * flat or near-flat covers of different colours don't collapse together.
 */
export interface ArtHash {
  bits: string
  rgb: [number, number, number]
}

const HASH_W = 9
const HASH_H = 8
/** Bits that may differ (of 64) for two covers to still count as the same. */
const MAX_BIT_DISTANCE = 6
/** Mean-colour distance (0–441) under which two covers count as the same. */
const MAX_COLOUR_DISTANCE = 28

const hashes = new Map<string, ArtHash | null>()
/** Callbacks waiting on a hash that is being computed. */
const inflight = new Map<string, Array<() => void>>()

/** `undefined` = not computed yet, `null` = the image couldn't be decoded. */
export function peekArtHash(key: string): ArtHash | null | undefined {
  return hashes.get(key)
}

/** Computes (once) the hash of `blob` under `key`, then calls `onDone`. */
export function ensureArtHash(
  key: string,
  blob: Blob,
  onDone: () => void
): void {
  if (hashes.has(key)) return
  // Several covers can ask for the same song at once; all get notified.
  const waiting = inflight.get(key)
  if (waiting) {
    waiting.push(onDone)
    return
  }
  inflight.set(key, [onDone])
  void computeHash(blob)
    .catch(() => null)
    .then((hash) => {
      hashes.set(key, hash)
      const callbacks = inflight.get(key) ?? []
      inflight.delete(key)
      for (const callback of callbacks) callback()
    })
}

async function computeHash(blob: Blob): Promise<ArtHash | null> {
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = HASH_W
    canvas.height = HASH_H
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return null
    context.drawImage(bitmap, 0, 0, HASH_W, HASH_H)
    const { data } = context.getImageData(0, 0, HASH_W, HASH_H)
    const grey: number[] = []
    let r = 0
    let g = 0
    let b = 0
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]!
      g += data[i + 1]!
      b += data[i + 2]!
      grey.push(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!)
    }
    const pixels = HASH_W * HASH_H
    let bits = ""
    for (let y = 0; y < HASH_H; y++) {
      for (let x = 0; x < HASH_W - 1; x++) {
        bits += grey[y * HASH_W + x]! > grey[y * HASH_W + x + 1]! ? "1" : "0"
      }
    }
    return { bits, rgb: [r / pixels, g / pixels, b / pixels] }
  } finally {
    bitmap.close()
  }
}

/** True when two covers look like the same picture. */
export function sameArt(a: ArtHash, b: ArtHash): boolean {
  let distance = 0
  for (let i = 0; i < a.bits.length; i++) {
    if (a.bits[i] !== b.bits[i]) distance++
  }
  const colour = Math.hypot(
    a.rgb[0] - b.rgb[0],
    a.rgb[1] - b.rgb[1],
    a.rgb[2] - b.rgb[2]
  )
  return distance <= MAX_BIT_DISTANCE && colour <= MAX_COLOUR_DISTANCE
}
