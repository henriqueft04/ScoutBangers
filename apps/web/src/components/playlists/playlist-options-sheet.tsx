import * as React from "react"
import { createPortal } from "react-dom"
import {
  ArrowDownCircle,
  Check,
  CirclePlus,
  Globe,
  ImageOff,
  ImagePlus,
  ListPlus,
  LogOut,
  Loader2,
  Lock,
  Pencil,
  Share2,
  Trash2,
  UserPlus,
} from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { PlaylistCover } from "@/components/playlists/playlist-cover"
import { formatBytes } from "@/lib/format"
import type { Song } from "@/lib/types"

function MenuItem({
  icon,
  children,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "hover:bg-accent/50 flex items-center gap-5 rounded-md px-3 py-3.5 text-left text-base transition-colors disabled:opacity-60",
        destructive ? "text-destructive" : "text-foreground"
      )}
    >
      <span
        className={cn("shrink-0", destructive ? "" : "text-muted-foreground")}
      >
        {icon}
      </span>
      {children}
    </button>
  )
}

interface PlaylistOptionsSheetProps {
  open: boolean
  onClose: () => void
  playlist: {
    id: string
    name: string
    cover_url: string | null
    is_public: boolean
    is_owner: boolean
    song_ids: string[]
  }
  songs: Song[]
  ownerName?: string
  saveCount: number
  /** Owner or accepted collaborator. */
  canEdit: boolean
  isFavorites: boolean
  linkCopied: boolean
  coverBusy: boolean
  /** Offline download state; `offlineBytes` is what is left to download. */
  fullyOffline: boolean
  offlineDownloading: boolean
  offlineBytes: number
  onShare: () => void
  onAddSongs: () => void
  onRename: () => void
  onChangeCover: () => void
  onRemoveCover: () => void
  onTogglePublic: () => void
  onCollaborators: () => void
  onQueue: () => void
  onDownload: () => void
  onLeave: () => void
  onDelete: () => void
}

/**
 * The ⋮ options modal of a playlist: cover and details on top, then one
 * row per action. Rows only appear for people who may use them.
 */
export function PlaylistOptionsSheet(props: PlaylistOptionsSheetProps) {
  const { open, onClose } = props

  React.useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", close)
    return () => document.removeEventListener("keydown", close)
  }, [open, onClose])

  if (!open) return null

  return createPortal(<PlaylistOptionsPanel {...props} />, document.body)
}

/** The sheet itself (overlay + panel), split out from the portal. */
export function PlaylistOptionsPanel(props: PlaylistOptionsSheetProps) {
  const { onClose, playlist, songs } = props

  // Every row closes the sheet first, then runs its action.
  const run = (action: () => void) => () => {
    onClose()
    action()
  }
  const hasSongs = songs.length > 0
  const { canEdit, isFavorites } = props

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Opções da playlist"
      className="bg-background/80 fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        role="menu"
        className="bg-card text-card-foreground border-border animate-in slide-in-from-bottom md:fade-in flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl border px-2 pt-3 shadow-xl duration-200 ease-out md:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div
          aria-hidden
          className="bg-muted-foreground/40 mx-auto mb-4 h-1 w-10 shrink-0 rounded-full"
        />
        <div className="border-border mb-1 flex items-center gap-4 border-b px-3 pb-4">
          <PlaylistCover
            songs={songs}
            coverUrl={playlist.cover_url}
            seed={playlist.id}
            compact
            className="w-28 shrink-0 rounded-md"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-foreground text-xl leading-tight font-semibold tracking-tight break-words">
              {playlist.name}
            </h2>
            <p className="text-muted-foreground text-sm">
              {[
                props.ownerName ? `de ${props.ownerName}` : null,
                playlist.is_public && props.saveCount > 0
                  ? `Guardada por ${props.saveCount}`
                  : null,
                playlist.is_public ? "Playlist pública" : "Playlist privada",
              ]
                .filter(Boolean)
                .join(" • ")}
            </p>
          </div>
        </div>

        {playlist.is_public ? (
          <MenuItem
            icon={
              props.linkCopied ? (
                <Check className="size-6" />
              ) : (
                <Share2 className="size-6" />
              )
            }
            onClick={run(props.onShare)}
          >
            Partilhar
          </MenuItem>
        ) : null}
        {canEdit ? (
          <MenuItem
            icon={<CirclePlus className="size-6" />}
            onClick={run(props.onAddSongs)}
          >
            Adicionar a esta playlist
          </MenuItem>
        ) : null}
        {canEdit && !isFavorites ? (
          <MenuItem
            icon={<Pencil className="size-6" />}
            onClick={run(props.onRename)}
          >
            Editar nome
          </MenuItem>
        ) : null}
        {canEdit ? (
          <MenuItem
            icon={<ImagePlus className="size-6" />}
            disabled={props.coverBusy}
            onClick={run(props.onChangeCover)}
          >
            Editar capa
          </MenuItem>
        ) : null}
        {canEdit && playlist.cover_url ? (
          <MenuItem
            icon={<ImageOff className="size-6" />}
            onClick={run(props.onRemoveCover)}
          >
            Remover capa
          </MenuItem>
        ) : null}
        {playlist.is_owner && !isFavorites ? (
          <MenuItem
            icon={
              playlist.is_public ? (
                <Lock className="size-6" />
              ) : (
                <Globe className="size-6" />
              )
            }
            onClick={run(props.onTogglePublic)}
          >
            {playlist.is_public ? "Tornar privada" : "Tornar pública"}
          </MenuItem>
        ) : null}
        {canEdit && !isFavorites ? (
          <MenuItem
            icon={<UserPlus className="size-6" />}
            onClick={run(props.onCollaborators)}
          >
            {playlist.is_owner ? "Convidar colaborador" : "Colaboradores"}
          </MenuItem>
        ) : null}
        {hasSongs ? (
          <MenuItem
            icon={<ListPlus className="size-6" />}
            onClick={run(props.onQueue)}
          >
            Adicionar à fila
          </MenuItem>
        ) : null}
        {hasSongs ? (
          <MenuItem
            icon={
              props.offlineDownloading ? (
                <Loader2 className="size-6 animate-spin" />
              ) : props.fullyOffline ? (
                <Check className="size-6" />
              ) : (
                <ArrowDownCircle className="size-6" />
              )
            }
            disabled={props.offlineDownloading || props.fullyOffline}
            onClick={run(props.onDownload)}
          >
            {props.fullyOffline
              ? "Disponível offline"
              : `Transferir (${formatBytes(props.offlineBytes)})`}
          </MenuItem>
        ) : null}
        {canEdit && !playlist.is_owner ? (
          <MenuItem
            destructive
            icon={<LogOut className="size-6" />}
            onClick={run(props.onLeave)}
          >
            Sair da playlist
          </MenuItem>
        ) : null}
        {playlist.is_owner && !isFavorites ? (
          <MenuItem
            destructive
            icon={<Trash2 className="size-6" />}
            onClick={run(props.onDelete)}
          >
            Eliminar playlist
          </MenuItem>
        ) : null}
      </div>
    </div>
  )
}
