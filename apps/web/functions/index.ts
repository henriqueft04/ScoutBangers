import { getDriveAccessToken } from "./api/_lib/drive-auth"
import { fetchCover } from "./_lib/cover"

interface Env {
  ASSETS: Fetcher
  DRIVE_FOLDER_ID: string
  GOOGLE_SERVICE_ACCOUNT_JSON: string
}

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
// WhatsApp drops preview images much over ~300 KB, so a bigger cover would
// give no image at all — those fall back to the app icon instead.
const MAX_PREVIEW_COVER_BYTES = 300 * 1024
const SONG_ID = /^[\w-]{10,100}$/

/**
 * Link-preview crawlers (WhatsApp, iMessage, Telegram…) never run JS, so the
 * SPA's static index.html gives every shared link the same generic card.
 * For `/?song=<id>` we look the song up and rewrite the head's Open Graph
 * tags so the preview names the song that was actually shared.
 */
export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  next,
}) => {
  const url = new URL(request.url)
  const id = url.searchParams.get("song")
  if (!id || !SONG_ID.test(id)) return next()

  let title: string | undefined
  try {
    const token = await getDriveAccessToken(env)
    const res = await fetch(
      `${DRIVE_FILES_URL}/${encodeURIComponent(id)}?fields=name,parents,mimeType`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (res.ok) {
      const file = (await res.json()) as {
        name: string
        parents?: string[]
        mimeType: string
      }
      // Only reveal names of songs that are in the library folder.
      if (
        file.mimeType.startsWith("audio/") &&
        file.parents?.includes(env.DRIVE_FOLDER_ID)
      ) {
        title = file.name.replace(/\.[a-z0-9]+$/i, "").trim()
      }
    }
  } catch {
    /* fall through to the generic card */
  }
  if (!title) return next()

  const response = await next()
  const image = await previewImage(url.origin, id)
  const og = (property: string, content: string) =>
    `<meta property="${property}" content="${content.replace(/"/g, "&quot;")}" />`

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(`${title} — ScoutBangers`)
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute("content", "Ouve esta música no ScoutBangers.")
      },
    })
    .on("head", {
      element(el) {
        el.append(
          [
            og("og:type", "website"),
            og("og:site_name", "ScoutBangers"),
            og("og:title", title!),
            og("og:description", "Ouve esta música no ScoutBangers."),
            og("og:url", `${url.origin}/?song=${id}`),
            og("og:image", image),
            '<meta name="twitter:card" content="summary" />',
          ].join(""),
          { html: true }
        )
      },
    })
    .transform(response)
}

/**
 * Picks the link-preview image: the song's cover resized to a small square
 * through Cloudflare Image Transformations when the zone has them enabled,
 * else the raw cover if it is small enough for WhatsApp, else the app icon.
 */
async function previewImage(origin: string, id: string): Promise<string> {
  const icon = `${origin}/icon-512.png`
  const coverUrl = `${origin}/api/cover/${id}`

  const resized = `${origin}/cdn-cgi/image/width=600,height=600,fit=cover,format=jpeg,quality=80${new URL(coverUrl).pathname}`
  try {
    const res = await fetch(resized)
    if (res.ok && res.headers.get("content-type")?.startsWith("image/")) {
      return resized
    }
  } catch {
    /* transformations unavailable — try the raw cover */
  }

  const cover = await fetchCover(id)
  return cover && cover.data.length <= MAX_PREVIEW_COVER_BYTES ? coverUrl : icon
}
