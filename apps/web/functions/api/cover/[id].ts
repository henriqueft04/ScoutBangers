import { fetchCover } from "../../_lib/cover"

const SONG_ID = /^[\w-]{10,100}$/

/** Serves a song's embedded cover art — used as the link-preview image. */
export const onRequestGet: PagesFunction = async ({ params }) => {
  const id = String(params.id ?? "")
  if (!SONG_ID.test(id)) return new Response("Not found", { status: 404 })
  const cover = await fetchCover(id)
  if (!cover) return new Response("Not found", { status: 404 })
  return new Response(cover.data as unknown as BodyInit, {
    headers: {
      "Content-Type": cover.type,
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  })
}
