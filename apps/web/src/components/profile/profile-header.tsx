import * as React from "react"
import { Loader2, Pencil } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { ScoutBadge } from "@/components/profile/scout-badge"

/**
 * Shared layout for the personal profile page and the public profile
 * page: full-width banner, centered overlapping avatar, name + scout
 * badge centered beneath.
 *
 * Editable mode (the personal `/profile` page) adds pencil affordances
 * over the banner and avatar wired to file pickers. The public read-
 * only view passes a `topLeftSlot` (the "Voltar" pill) instead.
 */

interface ProfileHeaderProps {
  displayName: string
  avatarUrl: string | null
  bannerUrl: string | null
  regiao: string | null
  nucleo: string | null
  agrupamentoNumero: number | null
  agrupamentoNome: string | null
  /** Already-formatted join date (or any subtitle line). Optional. */
  subtitle?: string | null
  /** Slot for content overlaid in the top-left of the banner — e.g. a
   *  "Voltar" pill on the public view. */
  topLeftSlot?: React.ReactNode
  /** Slot for buttons under the name — e.g. sign-out, edit link. */
  bottomSlot?: React.ReactNode
  /** When provided, banner + avatar become buttons that fire these
   *  handlers, and a pencil/spinner is shown on each. */
  editable?: {
    onAvatarPick: () => void
    onBannerPick: () => void
    uploadingAvatar: boolean
    uploadingBanner: boolean
  }
}

export function ProfileHeader({
  displayName,
  avatarUrl,
  bannerUrl,
  regiao,
  nucleo,
  agrupamentoNumero,
  agrupamentoNome,
  subtitle,
  topLeftSlot,
  bottomSlot,
  editable,
}: ProfileHeaderProps) {
  const initial = displayName.charAt(0).toUpperCase()

  const bannerInner = (
    <>
      {bannerUrl ? (
        <img
          src={bannerUrl}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          className="from-primary/70 to-primary/20 block size-full bg-gradient-to-br"
          aria-hidden
        />
      )}
      {editable ? (
        <span
          aria-hidden
          className={cn(
            "bg-card text-foreground absolute top-3 right-3 flex size-8 items-center justify-center rounded-full shadow-sm transition-transform",
            "group-hover:scale-110 group-focus-visible:scale-110"
          )}
        >
          {editable.uploadingBanner ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Pencil className="size-4" />
          )}
        </span>
      ) : null}
    </>
  )

  const avatarInner = (
    <>
      <span className="bg-primary text-primary-foreground flex size-full items-center justify-center overflow-hidden rounded-full text-3xl font-semibold">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initial
        )}
      </span>
      {editable ? (
        <span
          aria-hidden
          className={cn(
            "bg-card text-foreground border-background absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full border-2 shadow-sm transition-transform",
            "group-hover:scale-110 group-focus-visible:scale-110"
          )}
        >
          {editable.uploadingAvatar ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Pencil className="size-4" />
          )}
        </span>
      ) : null}
    </>
  )

  return (
    <section className="relative">
      {editable ? (
        <button
          type="button"
          onClick={editable.onBannerPick}
          disabled={editable.uploadingBanner}
          aria-label="Alterar imagem de capa"
          className="group bg-muted relative block h-44 w-full overflow-hidden md:h-60 md:rounded-b-xl"
        >
          {bannerInner}
        </button>
      ) : (
        <div className="bg-muted relative h-44 w-full overflow-hidden md:h-60 md:rounded-b-xl">
          {bannerInner}
          {topLeftSlot ? (
            <div className="absolute top-3 left-3">{topLeftSlot}</div>
          ) : null}
        </div>
      )}

      <div className="bg-background relative -mt-6 flex flex-col items-center gap-2 rounded-t-3xl px-3 pt-3 md:px-6">
        {editable ? (
          <button
            type="button"
            onClick={editable.onAvatarPick}
            disabled={editable.uploadingAvatar}
            aria-label="Alterar foto de perfil"
            className="group border-background relative -mt-14 size-28 shrink-0 rounded-full border-4 shadow-sm md:size-32"
          >
            {avatarInner}
          </button>
        ) : (
          <div className="border-background relative -mt-14 size-28 shrink-0 overflow-hidden rounded-full border-4 shadow-sm md:size-32">
            {avatarInner}
          </div>
        )}

        <h2 className="text-foreground mt-1 text-center text-2xl font-semibold tracking-tight md:text-3xl">
          {displayName}
        </h2>
        <ScoutBadge
          regiao={regiao}
          nucleo={nucleo}
          agrupamentoNumero={agrupamentoNumero}
          agrupamentoNome={agrupamentoNome}
          className="justify-center"
        />
        {subtitle ? (
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        ) : null}
        {bottomSlot}
      </div>
    </section>
  )
}
