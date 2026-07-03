import QRCode from "qrcode"

/**
 * Renders a 1080×1920 Instagram-Story card for a song and returns it as a PNG
 * Blob. The card is laid out in the app's two-color palette (maroon / off-white)
 * with the embedded album art, title, artist, and a QR code that deep-links
 * back to the song in the app.
 *
 * Note: `artUrl` must be same-origin (e.g. a `blob:` URL from parsed ID3 art).
 * A cross-origin image without CORS would taint the canvas and make
 * `toBlob` fail; we deliberately skip the art in that case rather than throw.
 */
export interface StoryCardInput {
  title: string
  artist?: string
  /** Same-origin image URL for the album art, if any. */
  artUrl?: string
  /** Absolute URL the QR code resolves to. */
  url: string
  /** App name shown in the footer. */
  appName?: string
}

// Brand palette (light theme), kept in sync with packages/ui globals.css.
const MAROON = "#7b2d26"
const MAROON_DEEP = "#591f1a"
const CREAM = "#f0f3f5"

const W = 1080
const H = 1920

export async function renderStoryCard(input: StoryCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")

  // Load album art first. If none, load the app icon as the fallback thumbnail.
  let art = input.artUrl ? await loadImage(input.artUrl) : null
  let isFallback = false
  if (!art) {
    isFallback = true
    try {
      art = await loadImage("/icon-512.png")
    } catch (e) {
      console.warn("Failed to load fallback app icon", e)
    }
  }

  // 1. Core Background: vertical maroon gradient.
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, MAROON)
  bg.addColorStop(1, MAROON_DEEP)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 2. Texture & Color depth
  if (art && !isFallback) {
    ctx.save()
    if (typeof ctx.filter !== "undefined") {
      ctx.filter = "blur(80px) saturate(140%)"
    }
    // cover-fit the canvas
    const scale = Math.max(W / art.width, H / art.height)
    const dw = art.width * scale
    const dh = art.height * scale
    ctx.globalAlpha = 0.38 // blend with deep maroon background
    ctx.drawImage(art, (W - dw) / 2, (H - dh) / 2, dw, dh)
    ctx.restore()
  } else {
    // Ambient glowing circles for songs without artwork (mesh gradient)
    ctx.save()
    if (typeof ctx.filter !== "undefined") {
      ctx.filter = "blur(120px)"
    }
    ctx.globalAlpha = 0.25

    // Crimson glow top-left
    ctx.fillStyle = "#b33f35"
    ctx.beginPath()
    ctx.arc(200, 400, 400, 0, Math.PI * 2)
    ctx.fill()

    // Dark charcoal glow bottom-right
    ctx.fillStyle = "#1e0908"
    ctx.beginPath()
    ctx.arc(W - 200, H - 400, 450, 0, Math.PI * 2)
    ctx.fill()

    // Soft warm gold glow center-right
    ctx.fillStyle = "#d4af37"
    ctx.beginPath()
    ctx.arc(W - 100, 1000, 250, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }

  // 3. Fine grain noise overlay (adds premium physical texture)
  const noiseCanvas = document.createElement("canvas")
  noiseCanvas.width = 128
  noiseCanvas.height = 128
  const noiseCtx = noiseCanvas.getContext("2d")
  if (noiseCtx) {
    const noiseData = noiseCtx.createImageData(128, 128)
    const data = noiseData.data
    for (let i = 0; i < data.length; i += 4) {
      const val = Math.floor(Math.random() * 255)
      data[i] = val
      data[i + 1] = val
      data[i + 2] = val
      data[i + 3] = 12 // Alpha: very subtle (approx. 4.7%)
    }
    noiseCtx.putImageData(noiseData, 0, 0)
    const pattern = ctx.createPattern(noiseCanvas, "repeat")
    if (pattern) {
      ctx.save()
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }
  }

  // Album art (or fallback block), centered near the top third.
  const artSize = 620
  const artX = (W - artSize) / 2
  const artY = 360

  roundRectPath(ctx, artX, artY, artSize, artSize, 48)
  ctx.save()
  ctx.clip()
  if (art) {
    // cover-fit the image into the square
    const scale = Math.max(artSize / art.width, artSize / art.height)
    const dw = art.width * scale
    const dh = art.height * scale
    ctx.drawImage(art, artX + (artSize - dw) / 2, artY + (artSize - dh) / 2, dw, dh)
  } else {
    ctx.fillStyle = CREAM
    ctx.fillRect(artX, artY, artSize, artSize)
    // simple music glyph
    ctx.fillStyle = MAROON
    ctx.font = "700 280px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("♪", W / 2, artY + artSize / 2)
  }
  ctx.restore()

  // Soft shadow ring around the art.
  ctx.strokeStyle = "rgba(0,0,0,0.18)"
  ctx.lineWidth = 2
  roundRectPath(ctx, artX, artY, artSize, artSize, 48)
  ctx.stroke()

  // Title + artist.
  ctx.fillStyle = CREAM
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  let textY = artY + artSize + 80
  ctx.font = "800 72px system-ui, sans-serif"
  textY = drawWrapped(ctx, input.title, W / 2, textY, W - 160, 86, 2)
  if (input.artist) {
    ctx.font = "500 48px system-ui, sans-serif"
    ctx.fillStyle = "rgba(240,243,245,0.75)"
    textY = drawWrapped(ctx, input.artist, W / 2, textY + 20, W - 200, 58, 1)
  }

  // QR code on a cream rounded card near the bottom.
  const qrSize = 280
  const qrPad = 36
  const cardSize = qrSize + qrPad * 2
  const cardX = (W - cardSize) / 2
  const cardY = H - 560
  ctx.fillStyle = CREAM
  roundRectPath(ctx, cardX, cardY, cardSize, cardSize, 40)
  ctx.fill()

  const qrCanvas = document.createElement("canvas")
  await QRCode.toCanvas(qrCanvas, input.url, {
    width: qrSize,
    margin: 0,
    color: { dark: MAROON, light: CREAM },
  })
  ctx.drawImage(qrCanvas, cardX + qrPad, cardY + qrPad, qrSize, qrSize)

  // "Aponta para ouvir" caption under the QR card.
  ctx.fillStyle = "rgba(240,243,245,0.85)"
  ctx.font = "600 38px system-ui, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  ctx.fillText("Aponta a câmara para ouvir", W / 2, cardY + cardSize + 28)

  // Footer brand name.
  ctx.fillStyle = "rgba(240,243,245,0.6)"
  ctx.font = "700 34px system-ui, sans-serif"
  ctx.fillText((input.appName ?? "ScoutBangers").toUpperCase(), W / 2, H - 90)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/png"
    )
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("image load failed"))
    img.src = src
  })
}

function roundRectPath(
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
function drawWrapped(
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
