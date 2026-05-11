const AUDIO_BASE_URL =
  (import.meta.env.VITE_AUDIO_BASE_URL as string | undefined) ??
  "https://audio.scoutbangers.com"

/**
 * Audio is served directly from a public R2 bucket on a custom domain.
 * Object key = Drive file ID, mirrored by the Drive→R2 sync Worker.
 * R2 supports Range natively, so HTML5 seeking works without a proxy.
 */
export function streamUrl(id: string): string {
  return `${AUDIO_BASE_URL}/${encodeURIComponent(id)}`
}
