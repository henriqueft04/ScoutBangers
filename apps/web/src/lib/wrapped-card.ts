import { createElement } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import type { LucideIcon } from "lucide-react"

import { drawWrapped, loadImage, roundRectPath } from "./canvas"

/**
 * Share images for ScoutBangers Wrapped: 1080×1920 Instagram-story PNGs,
 * drawn in the same flat colour fields and stitched "patch" edge as the
 * story itself. Lazy-loaded by the story player.
 *
 * Images must be same-origin (blob: covers) or CORS-enabled (Supabase
 * storage) — `loadImage` asks for CORS, and a failed load just drops the
 * image instead of failing the card.
 */

const W = 1080
const H = 1920
const FONT = '"Geist Variable", system-ui, sans-serif'

export interface StatCardInput {
  year: number
  bg: string
  fg: string
  /** Small line above the value. */
  kicker: string
  /** The big thing: a number, a name, a title. */
  value: string
  caption?: string
  imageUrl?: string | null
  imageShape?: "square" | "banner" | "circle" | "portrait"
  /** Big icon above the text (when there's no image). */
  icon?: LucideIcon
}

export interface SummaryCardInput {
  year: number
  bg: string
  fg: string
  accent: string
  name: string
  avatarUrl?: string | null
  coverUrl?: string | null
  minutes: number
  persona: string
  topArtists: string[]
  topSongs: string[]
}

async function setup(bg: string) {
  // Canvas text doesn't wait for webfonts: load the weights we draw with.
  try {
    await Promise.all([
      document.fonts.load(`800 100px ${FONT}`),
      document.fonts.load(`500 40px ${FONT}`),
    ])
  } catch {
    /* system font fallback */
  }
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  return { canvas, ctx }
}

/** A lucide icon as an SVG data URL, by rendering it off-screen. */
function iconDataUrl(Icon: LucideIcon, color: string): string {
  const host = document.createElement("div")
  const root = createRoot(host)
  flushSync(() =>
    root.render(createElement(Icon, { size: 400, color, strokeWidth: 1.5 }))
  )
  const svg = host.innerHTML
  root.unmount()
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

async function tryImage(url: string | null | undefined) {
  if (!url) return null
  try {
    return await loadImage(url)
  } catch {
    return null
  }
}

/** Dashed thread inset from the edge — the embroidered-patch look. */
function stitch(ctx: CanvasRenderingContext2D, color: string, inset = 40) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.8
  ctx.lineWidth = 6
  ctx.setLineDash([26, 18])
  roundRectPath(ctx, inset, inset, W - inset * 2, H - inset * 2, 56)
  ctx.stroke()
  ctx.restore()
}

function grain(ctx: CanvasRenderingContext2D) {
  const n = document.createElement("canvas")
  n.width = n.height = 128
  const nctx = n.getContext("2d")
  if (!nctx) return
  const img = nctx.createImageData(128, 128)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255)
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 14
  }
  nctx.putImageData(img, 0, 0)
  const pattern = ctx.createPattern(n, "repeat")
  if (!pattern) return
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, W, H)
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.save()
  roundRectPath(ctx, x, y, w, h, r)
  ctx.clip()
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

/** Ellipsizes `text` to fit `maxWidth` with the current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

/** Largest font size (≤ max) at which `text` fits in `maxWidth` on one line. */
function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  max: number,
  min: number,
  weight = 800
) {
  let size = max
  for (; size > min; size -= 4) {
    ctx.font = `${weight} ${size}px ${FONT}`
    if (ctx.measureText(text).width <= maxWidth) break
  }
  return size
}

function footer(ctx: CanvasRenderingContext2D, fg: string, year: number) {
  ctx.fillStyle = fg
  ctx.globalAlpha = 0.85
  ctx.font = `700 38px ${FONT}`
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  ctx.fillText(`ScoutBangers Wrapped ${year}`, W / 2, H - 110)
  ctx.globalAlpha = 0.6
  ctx.font = `500 30px ${FONT}`
  ctx.fillText(window.location.host || "scoutbangers.com", W / 2, H - 66)
  ctx.globalAlpha = 1
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/png"
    )
  )
}

export async function renderStatCard(input: StatCardInput): Promise<Blob> {
  const { canvas, ctx } = await setup(input.bg)
  const img = await tryImage(input.imageUrl)
  const left = 110
  const maxW = W - left * 2

  // Without an image, the year fills the top half, oversized and faint —
  // the same move as the story's intro.
  if (!img && !input.icon) {
    ctx.save()
    ctx.fillStyle = input.fg
    ctx.globalAlpha = 0.12
    ctx.font = `900 520px ${FONT}`
    ctx.textBaseline = "top"
    ctx.textAlign = "left"
    const digits = String(input.year)
    ctx.fillText(digits.slice(0, 2), left - 40, 90)
    ctx.fillText(digits.slice(2), left - 40, 520)
    ctx.restore()
  }

  if (img) {
    if (input.imageShape === "banner") {
      drawCover(ctx, img, left, 220, maxW, Math.round(maxW * 0.62), 36)
    } else if (input.imageShape === "portrait") {
      // A phone screen: dark frame, rounded, slightly tilted.
      const w = 440
      const h = Math.round(w * (img.height / img.width))
      ctx.save()
      ctx.translate(W / 2, 170 + h / 2)
      ctx.rotate((-4 * Math.PI) / 180)
      ctx.fillStyle = "#21110e"
      roundRectPath(ctx, -w / 2 - 18, -h / 2 - 18, w + 36, h + 36, 64)
      ctx.fill()
      drawCover(ctx, img, -w / 2, -h / 2, w, h, 46)
      ctx.restore()
    } else {
      const s = 720
      drawCover(ctx, img, (W - s) / 2, 200, s, s, input.imageShape === "circle" ? s / 2 : 36)
    }
  } else if (input.icon) {
    const icon = await tryImage(iconDataUrl(input.icon, input.fg))
    if (icon) ctx.drawImage(icon, (W - 400) / 2, 360, 400, 400)
  }

  // Text is laid out on a scratch canvas first, so the block can sit
  // anchored above the footer whatever its height.
  const text = document.createElement("canvas")
  text.width = W
  text.height = H
  const t = text.getContext("2d")!
  t.fillStyle = input.fg
  t.textAlign = "left"
  t.textBaseline = "top"
  t.font = `600 48px ${FONT}`
  t.globalAlpha = 0.85
  let y = drawLeft(t, input.kicker, left, 0, maxW, 60, 2)
  t.globalAlpha = 1
  const size = fitSize(t, input.value, maxW, 200, 92)
  t.font = `800 ${size}px ${FONT}`
  if (t.measureText(input.value).width <= maxW) {
    t.fillText(input.value, left - 4, y + 12)
    y += size * 1.08 + 28
  } else {
    y = drawLeft(t, input.value, left - 4, y + 12, maxW, size * 1.04, 3) + 28
  }
  if (input.caption) {
    t.font = `500 46px ${FONT}`
    t.globalAlpha = 0.9
    // Persona taglines run long: smaller type, more lines.
    const long = input.caption.length > 110
    t.font = `500 ${long ? 40 : 46}px ${FONT}`
    y = drawLeft(t, input.caption, left, y, maxW, long ? 54 : 60, long ? 8 : 4)
  }
  ctx.drawImage(text, 0, H - 250 - y)

  grain(ctx)
  stitch(ctx, input.fg)
  footer(ctx, input.fg, input.year)
  return toBlob(canvas)
}

export interface ListCardInput {
  year: number
  bg: string
  fg: string
  kicker: string
  /** Ranked lines, best first (up to 5). */
  items: string[]
  /** Optional square image above the list (e.g. the #1's cover). */
  imageUrl?: string | null
}

/** A numbered top-5, big type, anchored above the footer like the stat card. */
export async function renderListCard(input: ListCardInput): Promise<Blob> {
  const { canvas, ctx } = await setup(input.bg)
  const img = await tryImage(input.imageUrl)
  const left = 110
  const maxW = W - left * 2

  if (img) {
    const s = 560
    drawCover(ctx, img, (W - s) / 2, 190, s, s, 36)
  } else {
    ctx.save()
    ctx.fillStyle = input.fg
    ctx.globalAlpha = 0.12
    ctx.font = `900 520px ${FONT}`
    ctx.textBaseline = "top"
    ctx.textAlign = "left"
    ctx.fillText("TOP", left - 40, 120)
    ctx.restore()
  }

  const text = document.createElement("canvas")
  text.width = W
  text.height = H
  const t = text.getContext("2d")!
  t.fillStyle = input.fg
  t.textAlign = "left"
  t.textBaseline = "top"
  t.font = `600 48px ${FONT}`
  t.globalAlpha = 0.85
  let y = drawLeft(t, input.kicker, left, 0, maxW, 60, 2) + 24
  t.globalAlpha = 1
  const items = input.items.slice(0, 5)
  items.forEach((item, i) => {
    // Shrink a long name before cutting it short.
    const max = i === 0 ? 78 : 62
    const size = fitSize(t, item, maxW - 90, max, 44)
    t.font = `800 ${max}px ${FONT}`
    t.fillText(String(i + 1), left, y)
    t.font = `800 ${size}px ${FONT}`
    t.fillText(fit(t, item, maxW - 90), left + 90, y + (max - size) * 0.8)
    y += max * 1.3
  })
  ctx.drawImage(text, 0, H - 250 - y)

  grain(ctx)
  stitch(ctx, input.fg)
  footer(ctx, input.fg, input.year)
  return toBlob(canvas)
}

export async function renderSummaryCard(input: SummaryCardInput): Promise<Blob> {
  const { canvas, ctx } = await setup(input.bg)
  const [cover, avatar] = await Promise.all([
    tryImage(input.coverUrl),
    tryImage(input.avatarUrl),
  ])

  // Cover block, offset like a sewn-on patch.
  const s = 620
  const cx = (W - s) / 2
  const cy = 150
  ctx.fillStyle = input.accent
  roundRectPath(ctx, cx + 26, cy + 26, s, s, 40)
  ctx.fill()
  if (cover) drawCover(ctx, cover, cx, cy, s, s, 40)
  else {
    ctx.fillStyle = input.fg
    roundRectPath(ctx, cx, cy, s, s, 40)
    ctx.fill()
    ctx.fillStyle = input.bg
    ctx.font = `800 220px ${FONT}`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(String(input.year), W / 2, cy + s / 2)
  }

  if (avatar) {
    const a = 150
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx - 10 + a / 2, cy + s - a / 2 + 30, a / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.lineWidth = 12
    ctx.strokeStyle = input.bg
    ctx.stroke()
    ctx.clip()
    ctx.drawImage(avatar, cx - 10, cy + s - a + 30, a, a)
    ctx.restore()
  }

  ctx.fillStyle = input.fg
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  const nameSize = fitSize(ctx, input.name, W - 200, 84, 48)
  ctx.font = `800 ${nameSize}px ${FONT}`
  ctx.fillText(fit(ctx, input.name, W - 200), W / 2, cy + s + 72)

  // Two ranked columns.
  const colY = cy + s + 216
  const colW = (W - 110 * 2 - 60) / 2
  const cols: [string, string[], number][] = [
    ["Top artistas", input.topArtists, 110],
    ["Top músicas", input.topSongs, 110 + colW + 60],
  ]
  ctx.textAlign = "left"
  for (const [title, items, x] of cols) {
    ctx.globalAlpha = 0.75
    ctx.font = `600 38px ${FONT}`
    ctx.fillText(title, x, colY)
    ctx.globalAlpha = 1
    items.slice(0, 5).forEach((item, i) => {
      const y = colY + 76 + i * 74
      ctx.font = `800 46px ${FONT}`
      ctx.fillText(String(i + 1), x, y)
      ctx.font = `600 46px ${FONT}`
      ctx.fillText(fit(ctx, item, colW - 56), x + 56, y)
    })
  }

  // Minutes + persona.
  const statY = colY + 76 + 5 * 74 + 70
  ctx.globalAlpha = 0.75
  ctx.font = `600 36px ${FONT}`
  ctx.fillText("Minutos a ouvir", 110, statY)
  ctx.fillText("Perfil de ouvinte", 110 + colW + 60, statY)
  ctx.globalAlpha = 1
  const minutes = new Intl.NumberFormat("pt-PT").format(input.minutes)
  ctx.font = `800 ${fitSize(ctx, minutes, colW, 120, 56)}px ${FONT}`
  ctx.fillText(minutes, 106, statY + 52)
  ctx.font = `800 54px ${FONT}`
  drawLeft(ctx, input.persona, 110 + colW + 60, statY + 60, colW, 62, 2)

  grain(ctx)
  stitch(ctx, input.fg)
  footer(ctx, input.fg, input.year)
  return toBlob(canvas)
}

/** `drawWrapped` but left-aligned at `x`. */
function drawLeft(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const align = ctx.textAlign
  ctx.textAlign = "left"
  const out = drawWrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines)
  ctx.textAlign = align
  return out
}
