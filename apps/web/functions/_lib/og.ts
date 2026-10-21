import { fetchCover } from "./cover"

export interface LinkPreview {
  title: string
  description: string
  /** Canonical absolute URL of the shared page. */
  url: string
  /** Absolute image URL. */
  image: string
}

const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

/**
 * Link-preview crawlers (WhatsApp, iMessage, Telegram…) never run JS, so the
 * SPA's static index.html gives every shared link the same generic card.
 * Rewrites the head of that page so the preview names what was shared.
 * Values may contain user text (song and playlist names), so they're escaped.
 */
export function withLinkPreview(
  response: Response,
  preview: LinkPreview
): Response {
  const og = (property: string, content: string) =>
    `<meta property="${property}" content="${escapeAttribute(content)}" />`

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(`${preview.title} — ScoutBangers`)
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute("content", preview.description)
      },
    })
    .on("head", {
      element(el) {
        el.append(
          [
            og("og:type", "website"),
            og("og:site_name", "ScoutBangers"),
            og("og:title", preview.title),
            og("og:description", preview.description),
            og("og:url", preview.url),
            og("og:image", preview.image),
            '<meta name="twitter:card" content="summary" />',
          ].join(""),
          { html: true }
        )
      },
    })
    .transform(response)
}

/**
 * Picks the link-preview image for a song: its cover cropped to a small
 * square through Cloudflare Image Transformations (WhatsApp drops big
 * images), or the app icon when the song has no embedded cover.
 *
 * The transformation URL can't be probed from inside the Worker (a
 * subrequest to this zone's /cdn-cgi/ doesn't go through the transformer),
 * so it is trusted once the cover itself is known to exist.
 */
export async function songPreviewImage(
  origin: string,
  id: string
): Promise<string> {
  const cover = await fetchCover(id)
  if (!cover) return `${origin}/icon-512.png`
  return `${origin}/cdn-cgi/image/width=600,height=600,fit=cover,format=jpeg,quality=80/api/cover/${id}`
}
