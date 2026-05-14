import * as React from "react"
import { Compass, Info, Loader2, LogOut } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { SignInDialog } from "@/components/auth/sign-in-dialog"
import { EmptyState } from "@/components/library/empty-state"
import { ProfileEditSection } from "@/components/profile/profile-edit-section"
import { ProfileHeader } from "@/components/profile/profile-header"
import { StorageSection } from "@/components/profile/storage-section"
import { TopList } from "@/components/profile/top-list"
import { useAuth } from "@/hooks/useAuth"
import { useTopStats } from "@/hooks/useTopStats"
import { useTour } from "@/hooks/useTour"
import { artistHref } from "@/lib/artists"
import { uploadAvatar, uploadBanner } from "@/lib/avatar-upload"
import { formatJoinDate } from "@/lib/format-date"
import { supabase, supabaseConfigured } from "@/lib/supabase"

export function ProfilePage() {
  const { user, profile, loading: authLoading, signOut, refreshProfile } =
    useAuth()
  const { start: startTour } = useTour()
  const { topSongs, topArtists } = useTopStats(user?.id ?? null, {
    refetchOnVisibility: true,
  })
  const [signInOpen, setSignInOpen] = React.useState(false)
  const [savingPrivacy, setSavingPrivacy] = React.useState(false)
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false)
  const [uploadingBanner, setUploadingBanner] = React.useState(false)
  const [imageError, setImageError] = React.useState<string | null>(null)
  const avatarInputRef = React.useRef<HTMLInputElement | null>(null)
  const bannerInputRef = React.useRef<HTMLInputElement | null>(null)

  const handleAvatarPick = () => {
    if (uploadingAvatar) return
    avatarInputRef.current?.click()
  }
  const handleBannerPick = () => {
    if (uploadingBanner) return
    bannerInputRef.current?.click()
  }

  const runUpload = async (
    file: File,
    field: "avatar_url" | "banner_url",
    upload: (file: File) => Promise<string>,
    setBusy: (busy: boolean) => void
  ) => {
    if (!supabase || !user) return
    setImageError(null)
    setBusy(true)
    try {
      const url = await upload(file)
      const patch =
        field === "avatar_url" ? { avatar_url: url } : { banner_url: url }
      const { error: dbError } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", user.id)
      if (dbError) throw new Error(dbError.message)
      await refreshProfile()
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : "Falhou o carregamento da imagem."
      )
    } finally {
      setBusy(false)
    }
  }

  const handleAvatarChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) await runUpload(file, "avatar_url", uploadAvatar, setUploadingAvatar)
  }
  const handleBannerChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) await runUpload(file, "banner_url", uploadBanner, setUploadingBanner)
  }

  const shareActivity = profile?.share_activity ?? true

  const togglePrivacy = async () => {
    if (!supabase || !user) return
    setSavingPrivacy(true)
    const next = !shareActivity
    await supabase
      .from("profiles")
      .update({ share_activity: next })
      .eq("id", user.id)
    await refreshProfile()
    setSavingPrivacy(false)
  }

  if (authLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 pt-6 md:px-6">
        <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 pt-6 md:px-6">
        <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
          Perfil
        </h2>
        <EmptyState
          variant="empty"
          message={
            supabaseConfigured
              ? "Inicia sessão para veres as tuas estatísticas e favoritos."
              : "A autenticação ainda não está configurada."
          }
        />
        {supabaseConfigured ? (
          <Button
            type="button"
            className="self-start"
            onClick={() => setSignInOpen(true)}
          >
            Iniciar sessão
          </Button>
        ) : null}
        <StorageSection />
        <Link
          to="/sobre"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 self-start text-sm"
        >
          <Info className="size-4" />
          Sobre o ScoutBangers
        </Link>
        <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
      </div>
    )
  }

  const displayName =
    profile?.display_name ??
    user.user_metadata?.name ??
    user.email?.split("@")[0] ??
    "Ouvinte"
  const avatarUrl = profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null
  const bannerUrl = profile?.banner_url ?? null
  const joined = formatJoinDate(user.created_at)

  return (
    <div className="mx-auto w-full max-w-3xl pb-4">
      <ProfileHeader
        displayName={displayName}
        avatarUrl={avatarUrl}
        bannerUrl={bannerUrl}
        regiao={profile?.regiao ?? null}
        nucleo={profile?.nucleo ?? null}
        agrupamentoNumero={profile?.agrupamento_numero ?? null}
        agrupamentoNome={profile?.agrupamento_nome ?? null}
        subtitle={`Inscreveu-se a ${joined}`}
        editable={{
          onAvatarPick: handleAvatarPick,
          onBannerPick: handleBannerPick,
          uploadingAvatar,
          uploadingBanner,
        }}
        bottomSlot={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            Terminar sessão
          </Button>
        }
      />
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleAvatarChange}
      />
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleBannerChange}
      />

      <div className="flex flex-col gap-6 px-3 pt-6 md:px-6">
        {imageError ? (
          <p className="text-destructive text-center text-xs" role="alert">
            {imageError}
          </p>
        ) : null}

        <ProfileEditSection />

      <section className="border-border bg-card rounded-md border p-4">
        <h3 className="text-muted-foreground mb-2 text-xs uppercase tracking-wider">
          Tutorial
        </h3>
        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-foreground text-sm font-medium">
              Passeio guiado
            </span>
            <span className="text-muted-foreground text-xs">
              Volta a ver a apresentação interativa das funcionalidades da app.
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            onClick={() => startTour("main")}
            className="shrink-0"
          >
            <Compass className="size-4" />
            Iniciar
          </Button>
        </div>
      </section>

      <section className="border-border bg-card rounded-md border p-4">
        <h3 className="text-muted-foreground mb-2 text-xs uppercase tracking-wider">
          Privacidade
        </h3>
        <button
          type="button"
          onClick={togglePrivacy}
          disabled={savingPrivacy}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-pressed={shareActivity}
        >
          <span className="flex flex-col">
            <span className="text-foreground text-sm font-medium">
              Partilhar a minha atividade
            </span>
            <span className="text-muted-foreground text-xs">
              {shareActivity
                ? "Os amigos conseguem ver o que estás a ouvir."
                : "Oculto — as tuas reproduções continuam a contar, mas ninguém as vê."}
            </span>
          </span>
          <span
            role="presentation"
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              shareActivity ? "bg-primary" : "bg-muted",
              savingPrivacy && "opacity-60"
            )}
          >
            <span
              className={cn(
                "bg-background size-5 rounded-full shadow transition-transform",
                shareActivity ? "translate-x-5" : "translate-x-0.5"
              )}
            />
          </span>
        </button>
      </section>

      <StorageSection />

      <TopList
        title="Top 5 músicas"
        items={
          topSongs?.map((song) => ({
            id: song.id,
            label: song.title,
            count: song.playCount,
          })) ?? null
        }
        emptyMessage="Ainda nada — ouve umas músicas para veres o teu top."
      />

      <TopList
        title="Top 5 artistas"
        items={
          topArtists?.map((artist) => ({
            id: artist.name,
            label: artist.name,
            count: artist.playCount,
            href: artistHref(artist.name),
          })) ?? null
        }
        emptyMessage="Ainda não há reproduções de artistas registadas."
      />

        <Link
          to="/sobre"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 self-start text-sm"
        >
          <Info className="size-4" />
          Sobre o ScoutBangers
        </Link>
      </div>
    </div>
  )
}
