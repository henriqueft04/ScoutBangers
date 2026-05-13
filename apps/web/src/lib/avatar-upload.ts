/**
 * Resize a user-selected image down to a square avatar and upload it
 * to the R2-backed `/api/avatar` endpoint. Returns the public URL we
 * should persist on `profiles.avatar_url`.
 *
 * Resizing happens in the browser so we never ship multi-megabyte
 * originals over the wire — at 5000 users that would add up fast.
 */

import { supabase } from "./supabase"

const AVATAR_SIZE = 256
const BANNER_WIDTH = 1200
const BANNER_HEIGHT = 400
const JPEG_QUALITY = 0.85

export async function uploadAvatar(file: File): Promise<string> {
  const blob = await resizeToSquareJpeg(file, AVATAR_SIZE, JPEG_QUALITY)
  return await sendUpload(blob, "avatar")
}

export async function uploadBanner(file: File): Promise<string> {
  const blob = await resizeToRectJpeg(
    file,
    BANNER_WIDTH,
    BANNER_HEIGHT,
    JPEG_QUALITY
  )
  return await sendUpload(blob, "banner")
}

export async function deleteAvatar(): Promise<void> {
  await sendDelete("avatar")
}

export async function deleteBanner(): Promise<void> {
  await sendDelete("banner")
}

async function sendUpload(blob: Blob, kind: "avatar" | "banner"): Promise<string> {
  const token = await getToken()
  const response = await fetch(`/api/avatar?kind=${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
      Authorization: `Bearer ${token}`,
    },
    body: blob,
  })
  if (!response.ok) throw new Error(await safeErrorMessage(response))
  const payload = (await response.json()) as { url: string }
  return payload.url
}

async function sendDelete(kind: "avatar" | "banner"): Promise<void> {
  const token = await getToken()
  const response = await fetch(`/api/avatar?kind=${kind}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(await safeErrorMessage(response))
}

async function getToken(): Promise<string> {
  if (!supabase) throw new Error("Sessão indisponível.")
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Sessão expirada. Volta a iniciar sessão.")
  return token
}

async function safeErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error) return body.error
  } catch {
    /* fall through */
  }
  return `Erro ${response.status}`
}

async function resizeToSquareJpeg(
  file: File,
  size: number,
  quality: number
): Promise<Blob> {
  return await resizeToRectJpeg(file, size, size, quality)
}

async function resizeToRectJpeg(
  file: File,
  targetW: number,
  targetH: number,
  quality: number
): Promise<Blob> {
  const bitmap = await loadBitmap(file)
  // Center-crop to the target aspect ratio so the source isn't
  // squished, then scale to (targetW, targetH).
  const targetAspect = targetW / targetH
  const sourceAspect = bitmap.width / bitmap.height
  let sx = 0
  let sy = 0
  let sw = bitmap.width
  let sh = bitmap.height
  if (sourceAspect > targetAspect) {
    sw = bitmap.height * targetAspect
    sx = (bitmap.width - sw) / 2
  } else {
    sh = bitmap.width / targetAspect
    sy = (bitmap.height - sh) / 2
  }

  const canvas = document.createElement("canvas")
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Não foi possível processar a imagem.")
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, targetW, targetH)
  bitmap.close?.()

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("A imagem não pôde ser convertida."))
      },
      "image/jpeg",
      quality
    )
  })
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file)
    } catch {
      /* fall through to <img> path */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const bitmap = await createImageBitmap(img)
    return bitmap
  } finally {
    URL.revokeObjectURL(url)
  }
}
