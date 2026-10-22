import * as React from "react"
import { Camera, Loader2 } from "lucide-react"

import { PlaylistCover } from "@/components/playlists/playlist-cover"
import { ImageCropper } from "@/components/profile/image-cropper"
import { useAuth } from "@/hooks/useAuth"
import {
  ARTIST_BANNER_HEIGHT,
  ARTIST_BANNER_WIDTH,
  artistKey,
  fetchArtistBanner,
  suggestArtistBanner,
} from "@/lib/artist-banners"
import type { Song } from "@/lib/types"

interface ArtistBannerProps {
  name: string
  /** The artist's songs: a mosaic of their covers shows until a banner is approved. */
  songs: Song[]
}

/**
 * The banner of an artist page: the approved banner if there is one,
 * otherwise a mosaic of the artist's covers (as playlists do). Anyone signed
 * in can suggest a new banner; it only replaces this one once an admin
 * approves it.
 */
export function ArtistBanner({ name, songs }: ArtistBannerProps) {
  const { user } = useAuth()
  // Tagged with the artist it belongs to, so a banner never shows on another
  // artist's page while the next one loads.
  const [loaded, setLoaded] = React.useState<{
    name: string
    url: string | null
  }>()
  const banner = loaded?.name === name ? loaded.url : null
  const [picked, setPicked] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState<{
    text: string
    failed: boolean
  } | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let cancelled = false
    void fetchArtistBanner(name).then((url) => {
      if (!cancelled) setLoaded({ name, url })
    })
    return () => {
      cancelled = true
    }
  }, [name])

  const handleConfirm = async (image: Blob) => {
    setPicked(null)
    setBusy(true)
    setNotice(null)
    try {
      await suggestArtistBanner(name, image)
      setNotice({
        text: "Sugestão enviada! O banner aparece depois de um admin aprovar.",
        failed: false,
      })
    } catch (reason) {
      setNotice({
        text:
          reason instanceof Error
            ? reason.message
            : "Não foi possível enviar a sugestão.",
        failed: true,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-tour-id="artist-banner" className="flex flex-col gap-2">
      <div className="relative">
        <PlaylistCover
          songs={songs}
          coverUrl={banner}
          seed={artistKey(name)}
          className="rounded-lg"
        />
        {user ? (
          <>
            <button
              type="button"
              aria-label="Sugerir banner"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="bg-background/80 text-foreground hover:bg-background absolute right-3 bottom-3 inline-flex size-10 items-center justify-center rounded-full shadow-md backdrop-blur-sm transition-colors disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Camera className="size-5" />
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file) setPicked(file)
              }}
            />
          </>
        ) : null}
      </div>
      {notice ? (
        <p
          role="status"
          className={
            notice.failed
              ? "text-destructive text-xs"
              : "text-muted-foreground text-xs"
          }
        >
          {notice.text}
        </p>
      ) : null}
      {picked ? (
        <ImageCropper
          file={picked}
          title="Ajustar banner"
          aspect={ARTIST_BANNER_WIDTH / ARTIST_BANNER_HEIGHT}
          outputWidth={ARTIST_BANNER_WIDTH}
          onCancel={() => setPicked(null)}
          onConfirm={handleConfirm}
        />
      ) : null}
    </div>
  )
}
