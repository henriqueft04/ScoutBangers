import { ConfirmDialog } from "@/components/profile/confirm-dialog"
import { formatBytes } from "@/lib/format"

interface CellularDownloadDialogProps {
  open: boolean
  targetBytes: number
  onConfirm: () => void
  onCancel: () => void
}

/**
 * "You appear to be on mobile data" confirmation, shown before a
 * multi-song offline download when `isLikelyCellular()` says so. Pairs
 * with `useOfflineDownload`'s `confirmingCellular` / `confirmCellularDownload`
 * / `cancelCellularConfirm` — every offline-download entry point (bulk
 * library, per-playlist, …) renders the exact same copy, so it lives here
 * once instead of being re-typed per call site.
 */
export function CellularDownloadDialog({
  open,
  targetBytes,
  onConfirm,
  onCancel,
}: CellularDownloadDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Pareces estar a usar dados móveis"
      description={
        <>
          Isto vai transferir{" "}
          <span className="tabular-nums">{formatBytes(targetBytes)}</span> pela
          tua ligação atual. Liga-te ao Wi-Fi se quiseres evitar gastos do
          plano de dados.
        </>
      }
      confirmLabel="Transferir mesmo assim"
      cancelLabel="Esperar pelo Wi-Fi"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
