import { getDriveAccessToken } from "./api/_lib/drive-auth"
import { withLinkPreview, songPreviewImage } from "./_lib/og"

interface Env {
  ASSETS: Fetcher
  DRIVE_FOLDER_ID: string
  GOOGLE_SERVICE_ACCOUNT_JSON: string
}

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
const SONG_ID = /^[\w-]{10,100}$/

/**
 * For `/?song=<id>` we look the song up and rewrite the head's Open Graph
 * tags (see `withLinkPreview`) so the preview names the song that was
 * actually shared.
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
  return withLinkPreview(response, {
    title,
    description: "Ouve este banger no ScoutBangers.",
    url: `${url.origin}/?song=${id}`,
    image: await songPreviewImage(url.origin, id),
  })
}
