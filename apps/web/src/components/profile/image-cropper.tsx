import * as React from "react"
import { createPortal } from "react-dom"
import { Loader2, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

interface ImageCropperProps {
  /** The picked (or existing) image. */
  file: Blob
  title: string
  /** Frame width / height. 1 = square, 3 = 3:1 banner. */
  aspect: number
  /** Output pixel width; height follows from `aspect`. */
  outputWidth: number
  /** Dim everything outside a circle, for images that are shown round. */
  circle?: boolean
  onCancel: () => void
  onConfirm: (cropped: Blob) => void | Promise<void>
}

const MAX_ZOOM = 4
const JPEG_QUALITY = 0.9

interface Point {
  x: number
  y: number
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file)
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return await createImageBitmap(img)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

/**
 * Lets the user position an image inside the exact frame it will be shown
 * in: drag to move, slider / wheel / pinch to zoom. What's visible inside
 * the frame is precisely what ends up in the output.
 */
export function ImageCropper({
  file,
  title,
  aspect,
  outputWidth,
  circle = false,
  onCancel,
  onConfirm,
}: ImageCropperProps) {
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null)
  const [url, setUrl] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [frame, setFrame] = React.useState({ w: 0, h: 0 })
  const [zoom, setZoom] = React.useState(1)
  // Image centre relative to the frame centre, in frame pixels.
  const [offset, setOffset] = React.useState<Point>({ x: 0, y: 0 })
  const [busy, setBusy] = React.useState(false)

  const frameRef = React.useRef<HTMLDivElement | null>(null)
  const pointers = React.useRef(new Map<number, Point>())
  const pinchStart = React.useRef<{ dist: number; zoom: number } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const objectUrl = URL.createObjectURL(file)
    decode(file)
      .then((b) => {
        if (cancelled) return
        setUrl(objectUrl)
        setBitmap(b)
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível ler esta imagem.")
      })
    return () => {
      cancelled = true
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  React.useEffect(() => {
    return () => bitmap?.close?.()
  }, [bitmap])

  // Track the frame's rendered size.
  React.useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [bitmap])

  // Scale at which the image exactly covers the frame (zoom = 1).
  const baseScale = bitmap
    ? Math.max(frame.w / bitmap.width, frame.h / bitmap.height)
    : 1
  const scale = baseScale * zoom

  const clamp = React.useCallback(
    (p: Point, s: number): Point => {
      if (!bitmap) return p
      const maxX = Math.max(0, (bitmap.width * s - frame.w) / 2)
      const maxY = Math.max(0, (bitmap.height * s - frame.h) / 2)
      return {
        x: Math.min(maxX, Math.max(-maxX, p.x)),
        y: Math.min(maxY, Math.max(-maxY, p.y)),
      }
    },
    [bitmap, frame.w, frame.h]
  )

  const applyZoom = React.useCallback(
    (next: number) => {
      const z = Math.min(MAX_ZOOM, Math.max(1, next))
      setZoom(z)
      setOffset((o) => clamp(o, baseScale * z))
    },
    [clamp, baseScale]
  )

  // Wheel zoom needs a non-passive listener to preventDefault.
  React.useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [applyZoom, zoom])

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const next = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, next)

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      applyZoom(pinchStart.current.zoom * (dist / pinchStart.current.dist))
      return
    }
    if (pointers.current.size === 1) {
      setOffset((o) => clamp({ x: o.x + next.x - prev.x, y: o.y + next.y - prev.y }, scale))
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null
  }

  const handleConfirm = async () => {
    if (!bitmap || frame.w === 0) return
    setBusy(true)
    try {
      const outW = outputWidth
      const outH = Math.round(outputWidth / aspect)
      // Source rectangle (in image pixels) currently visible in the frame.
      const sw = frame.w / scale
      const sh = frame.h / scale
      const sx = bitmap.width / 2 - (frame.w / 2 + offset.x) / scale
      const sy = bitmap.height / 2 - (frame.h / 2 + offset.y) / scale

      const canvas = document.createElement("canvas")
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("canvas unavailable")
      ctx.fillStyle = "#fff"
      ctx.fillRect(0, 0, outW, outH)
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
      )
      if (!blob) throw new Error("encode failed")
      await onConfirm(blob)
    } catch {
      setError("Não foi possível processar a imagem.")
      setBusy(false)
    }
  }

  const ready = bitmap !== null && frame.w > 0
  const imgW = bitmap ? bitmap.width * scale : 0
  const imgH = bitmap ? bitmap.height * scale : 0

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="bg-card border-border flex w-full max-w-md flex-col gap-4 rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-muted-foreground text-sm">
            Arrasta para centrar e usa o zoom. O que vês dentro da moldura é o
            que vai aparecer.
          </p>
        </div>

        <div
          ref={frameRef}
          className="bg-muted relative mx-auto w-full touch-none select-none overflow-hidden rounded-lg"
          style={{
            aspectRatio: String(aspect),
            maxWidth: aspect <= 1 ? "20rem" : undefined,
            cursor: "grab",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {url && ready ? (
            <img
              src={url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{
                width: imgW,
                height: imgH,
                left: frame.w / 2 + offset.x - imgW / 2,
                top: frame.h / 2 + offset.y - imgH / 2,
              }}
            />
          ) : (
            <div className="text-muted-foreground flex size-full items-center justify-center">
              {error ? (
                <span className="text-destructive px-4 text-center text-sm">{error}</span>
              ) : (
                <Loader2 className="size-5 animate-spin" />
              )}
            </div>
          )}
          {circle && ready ? (
            <div
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80"
              style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
            />
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <ZoomOut className="text-muted-foreground size-4 shrink-0" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!ready}
            onChange={(e) => applyZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="accent-primary h-1 w-full"
          />
          <ZoomIn className="text-muted-foreground size-4 shrink-0" />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={handleConfirm}
            disabled={!ready || busy}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            Confirmar
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
