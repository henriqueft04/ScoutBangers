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
