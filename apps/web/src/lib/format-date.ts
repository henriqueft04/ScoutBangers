/**
 * Format an ISO timestamp as a long-form locale date. Used for the
 * "Inscreveu-se a …" line under profile headers.
 */
export function formatJoinDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}
