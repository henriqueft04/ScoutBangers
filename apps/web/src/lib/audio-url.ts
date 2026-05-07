/**
 * Build the URL for streaming a Drive file via our serverless proxy. The proxy
 * (`apps/web/api/stream/[id].ts`) forwards Range headers so HTML5 `<audio>`
 * seeking works, and keeps the Drive API key server-side.
 */
export function streamUrl(id: string): string {
  return `/api/stream/${encodeURIComponent(id)}`
}
