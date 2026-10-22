import * as React from "react"
import { Check, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import {
  decideBanner,
  listPendingBanners,
  type PendingBanner,
} from "@/lib/artist-banners"

/** Admin tab: artist banner suggestions waiting for approval. */
export function AdminBanners() {
  const [banners, setBanners] = React.useState<PendingBanner[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    listPendingBanners()
      .then((rows) => {
        if (!cancelled) setBanners(rows)
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason.message : "Erro ao carregar."
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const decide = async (id: string, decision: "approve" | "reject") => {
    setBusyId(id)
    setError(null)
    try {
      await decideBanner(id, decision)
      setBanners((rows) => rows?.filter((row) => row.id !== id) ?? null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro.")
    } finally {
      setBusyId(null)
    }
  }

  if (!banners && !error) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        A carregar banners...
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {banners?.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          Não há banners à espera de aprovação.
        </p>
      ) : null}
      {banners?.map((banner) => (
        <div
          key={banner.id}
          className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm"
        >
          <img
            src={banner.imageUrl}
            alt={`Banner sugerido para ${banner.artistName}`}
            className="aspect-[1200/742] w-full rounded-md object-cover"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-foreground min-w-0 truncate text-sm font-semibold">
              {banner.artistName}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === banner.id}
                onClick={() => void decide(banner.id, "reject")}
              >
                <X className="size-4" />
                Rejeitar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busyId === banner.id}
                onClick={() => void decide(banner.id, "approve")}
              >
                <Check className="size-4" />
                Aprovar
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
