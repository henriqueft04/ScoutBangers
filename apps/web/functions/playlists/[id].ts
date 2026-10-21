import { withLinkPreview, songPreviewImage } from "../_lib/og"

interface Env {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

interface SharedPlaylist {
  name: string
  cover_url: string | null
  playlist_songs: { song_id: string }[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Link preview for a shared playlist: its name and cover with the same
 * "this is a banger" pitch as shared songs. Read with the anon key, so RLS
 * decides what is visible: private playlists get the generic card.
 */
export const onRequestGet: PagesFunction<Env, "id"> = async ({
  request,
  env,
  params,
  next,
}) => {
  const id = String(params.id ?? "")
  if (!UUID.test(id) || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    return next()
  }

  let playlist: SharedPlaylist | undefined
  try {
    const res = await fetch(
      `${env.VITE_SUPABASE_URL}/rest/v1/playlists?id=eq.${id}&is_public=eq.true` +
        `&select=name,cover_url,playlist_songs(song_id)` +
        `&playlist_songs.order=position.asc&playlist_songs.limit=1`,
      {
        headers: {
          apikey: env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
        },
      }
    )
    if (res.ok) playlist = ((await res.json()) as SharedPlaylist[])[0]
  } catch {
    /* fall through to the generic card */
  }
  if (!playlist) return next()

  const origin = new URL(request.url).origin
  const firstSong = playlist.playlist_songs[0]?.song_id
  const image =
    playlist.cover_url ??
    (firstSong ? await songPreviewImage(origin, firstSong) : `${origin}/icon-512.png`)

  return withLinkPreview(await next(), {
    title: playlist.name,
    description: "Olha esta playlist mesmo banger",
    url: `${origin}/playlists/${id}`,
    image,
  })
}
