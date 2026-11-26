/** Small Canvas 2D helpers shared by the share-image renderers. */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Remote images (Supabase storage, covers) must be fetched with CORS or
    // they taint the canvas and toBlob() throws.
    if (/^https?:/.test(src) && !src.startsWith(window.location.origin)) {
      img.crossOrigin = "anonymous"
    }
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("image load failed"))
    img.src = src
  })
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Draws center-aligned text wrapped to `maxWidth`, capped at `maxLines`
 * (last line ellipsized if it overflows). Returns the Y just below the
 * last drawn line.
 */
export function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): number {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    } else {
      line = candidate
    }
  }
  if (lines.length < maxLines && line) lines.push(line)

  if (lines.length === maxLines) {
    let last = lines[maxLines - 1] ?? ""
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 0) {
      last = last.slice(0, -1)
    }
    if (last !== (lines[maxLines - 1] ?? "")) lines[maxLines - 1] = `${last}…`
  }

  for (const l of lines) {
    ctx.fillText(l, cx, y)
    y += lineHeight
  }
  return y
}
