import * as React from "react"
import { Loader2 } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { SignInDialog } from "@/components/auth/sign-in-dialog"
import { buildSlides } from "@/components/wrapped/build-slides"
import { StoryPlayer } from "@/components/wrapped/story-player"
import { useAuth } from "@/hooks/useAuth"
import { useConnect } from "@/hooks/useConnect"
import { useJam } from "@/hooks/useJam"
import { usePlayer } from "@/hooks/usePlayer"
import { useWrapped } from "@/hooks/useWrapped"
import { canOpenWrapped, wrappedYear } from "@/lib/wrapped"

/**
 * /wrapped — the year-in-listening story. Signed-in users only, in season
 * (Dec–Jan) or for admins with ?preview=1.
 */
export function WrappedPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const year = wrappedYear()
  // Dev builds: /wrapped?mock=1 shows a made-up Wrapped, no sign-in needed.
  const mock = import.meta.env.DEV && new URLSearchParams(location.search).has("mock")
  const allowed = mock || canOpenWrapped(profile, location.search)
  const { data, loading, error, retry } = useWrapped(
    year,
    (Boolean(user) || mock) && allowed,
    mock
  )
  const [signInOpen, setSignInOpen] = React.useState(false)

  const close = React.useCallback(() => {
    // Opened from inside the app: go back. Opened from a link: go home.
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate("/", { replace: true })
  }, [navigate])

  const name =
    profile?.display_name ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "Ouvinte"
  const avatarUrl =
    profile?.avatar_url ?? (user?.user_metadata?.avatar_url as string | undefined) ?? null

  const slides = React.useMemo(
    () => (data ? buildSlides(data, { name, avatarUrl }) : null),
    [data, name, avatarUrl]
  )

  if (authLoading || ((user || mock) && allowed && (loading || (!slides && !error)))) {
    return <Centered><Loader2 className="text-muted-foreground size-6 animate-spin" /></Centered>
  }

  if (!user && !mock) {
    return (
      <Centered>
        <h2 className="text-foreground text-2xl font-bold tracking-tight">
          O teu Wrapped {year}
        </h2>
        <p className="text-muted-foreground max-w-sm">
          Inicia sessão para veres o teu ano no ScoutBangers: as músicas, os
          artistas e os minutos que ouviste.
        </p>
        <Button type="button" onClick={() => setSignInOpen(true)}>
          Iniciar sessão
        </Button>
        <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
      </Centered>
    )
  }

  if (!allowed) {
    return (
      <Centered>
        <h2 className="text-foreground text-2xl font-bold tracking-tight">
          O Wrapped volta em dezembro
        </h2>
        <p className="text-muted-foreground max-w-sm">
          Continua a ouvir: cada música conta para o teu Wrapped {year}, que
          abre a 1 de dezembro.
        </p>
      </Centered>
    )
  }

  if (error || !slides) {
    return (
      <Centered>
        <h2 className="text-foreground text-xl font-bold tracking-tight">
          Não foi possível carregar o teu Wrapped
        </h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          {error ?? "Tenta outra vez daqui a pouco."}
        </p>
        <Button type="button" onClick={retry}>
          Tentar outra vez
        </Button>
      </Centered>
    )
  }

  return <WrappedStory slides={slides} year={year} onClose={close} />
}

/**
 * Mounts the story, which plays with sound from the start. The app's own
 * music is paused first; in a jam it's only silenced on this device (pausing
 * would pause the whole room), and its sound comes back when the story closes.
 */
function WrappedStory({
  slides,
  year,
  onClose,
}: {
  slides: ReturnType<typeof buildSlides>
  year: number
  onClose: () => void
}) {
  const { isPlaying, toggle, muted, toggleMute } = usePlayer()
  const { roomId } = useJam()
  const { outputElsewhere } = useConnect()
  // As they were when the story opened.
  const [inJam] = React.useState(roomId !== null)
  const [playerWasMuted] = React.useState(muted)
  const paused = React.useRef(false)
  const mutedRef = React.useRef(muted)

  React.useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  React.useEffect(() => {
    // Once, on open. Playing on another device: nothing plays here.
    if (paused.current) return
    paused.current = true
    if (isPlaying && !inJam && !outputElsewhere) toggle()
  }, [isPlaying, inJam, outputElsewhere, toggle])

  React.useEffect(() => {
    if (!inJam || playerWasMuted) return
    // Mute is local only (not sent to the room).
    if (!mutedRef.current) toggleMute()
    return () => {
      if (mutedRef.current) toggleMute()
    }
  }, [inJam, playerWasMuted, toggleMute])

  return <StoryPlayer slides={slides} year={year} onClose={onClose} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </div>
  )
}
