/**
 * Cover art is embedded at whatever size the uploader had — up to 3000+ px
 * — but lists show it at ~40 px. A browser decodes an image at its *full*
 * size (width × height × 4 bytes) however small it is drawn, so a single
 * 3169 × 3169 cover costs ~40 MB of RAM and a list of them can get the page
 * killed on a phone. Lists show this small copy instead.
 */
const THUMBNAIL_MAX_SIDE = 192
const THUMBNAIL_QUALITY = 0.85

/**
 * The format a thumbnail of `sourceType` is encoded in. A JPEG source has no
 * transparency to lose, so it stays a (small) JPEG. Anything else — PNG
 * above all — may have an alpha channel, which JPEG would flatten onto a
 * solid background, so it stays lossless PNG instead.
 */
export function thumbnailType(sourceType: string): "image/jpeg" | "image/png" {
  return sourceType === "image/jpeg" || sourceType === "image/jpg"
    ? "image/jpeg"
    : "image/png"
}

async function decode(blob: Blob): Promise<{
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => undefined,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Downscales `blob` so its longest side is at most `maxSide` px, in the same
 * kind of format (see `thumbnailType`) so transparency survives. Resolves to
 * `undefined` if the image can't be decoded or encoded — callers show the
 * placeholder artwork instead of failing.
 *
 * The full image is decoded once, transiently, so call this one cover at a
 * time rather than in parallel.
 */
export async function makeThumbnail(
  blob: Blob,
  maxSide = THUMBNAIL_MAX_SIDE
): Promise<Blob | undefined> {
  try {
    const { source, width, height, release } = await decode(blob)
    try {
      if (width === 0 || height === 0) return undefined
      const scale = Math.min(1, maxSide / Math.max(width, height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const context = canvas.getContext("2d")
      if (!context) return undefined
      // The canvas starts fully transparent and drawImage keeps the source's
      // alpha, so a PNG's transparency carries over untouched.
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      const thumbnail = await new Promise<Blob | null>((resolve) =>
        // The quality argument only applies to JPEG; PNG ignores it.
        canvas.toBlob(resolve, thumbnailType(blob.type), THUMBNAIL_QUALITY)
      )
      // iOS keeps canvas backing stores alive until they are resized away.
      canvas.width = 0
      canvas.height = 0
      return thumbnail ?? undefined
    } finally {
      release()
    }
  } catch {
    return undefined
  }
}
