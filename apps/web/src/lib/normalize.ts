/**
 * Normalise text for accent- and case-insensitive matching. Uses Unicode NFD
 * decomposition + strips combining marks, so "Cenáculo" → "cenaculo",
 * "naïve" → "naive", "Drav'Este" → "drav'este".
 *
 * Use this on BOTH the haystack and the needle when comparing — applying it
 * to only one side defeats the point.
 */
export function normalizeText(input: string): string {
  return input.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}
