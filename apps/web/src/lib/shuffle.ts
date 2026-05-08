/**
 * Returns a new array with the input shuffled in place via Fisher–Yates.
 * The source array is not mutated.
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const result = [...input]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

/**
 * Build a shuffled order of indices `[0..length)` such that `firstIndex` (if
 * given) appears at position 0. Used by the player to start a shuffled queue
 * from the song the user just clicked.
 */
export function shuffledIndices(length: number, firstIndex?: number): number[] {
  const indices = Array.from({ length }, (_, i) => i)
  const shuffled = shuffle(indices)

  if (firstIndex === undefined) {
    return shuffled
  }

  const at = shuffled.indexOf(firstIndex)
  if (at <= 0) {
    return shuffled
  }
  ;[shuffled[0], shuffled[at]] = [shuffled[at]!, shuffled[0]!]
  return shuffled
}

/**
 * Shuffles a list while keeping the (optional) current song at its
 * original position. Used when toggling shuffle mid-playback so the
 * audible track doesn't jump and the upcoming queue gets a fresh
 * random order.
 */
export function shufflePreservingCurrent<T>(
  list: readonly T[],
  current: T | null
): T[] {
  if (current === null || list.length <= 1) return shuffle(list)
  const idx = list.indexOf(current)
  if (idx === -1) return shuffle(list)
  const others = [...list.slice(0, idx), ...list.slice(idx + 1)]
  const shuffled = shuffle(others)
  return [...shuffled.slice(0, idx), current, ...shuffled.slice(idx)]
}
