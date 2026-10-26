import {
  CATALOG_KEY,
  type Catalog,
} from "../../../apps/web/src/lib/song-catalog"
import { readTextTags } from "./id3"

/** How many songs' tags are read per run, so one run stays well within limits. */
const TAGS_PER_RUN = 60

export interface DriveSong {
  id: string
  modifiedTime: string
}

async function readCatalog(bucket: R2Bucket): Promise<Catalog> {
  const object = await bucket.get(CATALOG_KEY)
  if (!object) return {}
  try {
    return (await object.json()) as Catalog
  } catch {
    return {}
  }
}

/**
 * Brings the published catalog up to date with the Drive listing: songs that
 * are new or were edited get their tags read (from their copy in R2, once it
 * is as new as Drive's), songs that are gone are dropped. Reads at most
 * `TAGS_PER_RUN` songs, so a large backlog is worked off over several runs.
 * Returns how many songs were read.
 */
export async function refreshCatalog(
  bucket: R2Bucket,
  songs: readonly DriveSong[]
): Promise<number> {
  const stored = await readCatalog(bucket)
  const next: Catalog = {}
  let read = 0
  let changed = false

  for (const song of songs) {
    const known = stored[song.id]
    if (known?.modifiedTime === song.modifiedTime) {
      next[song.id] = known
      continue
    }
    // Until the tags can be read, an older entry beats none.
    if (known) next[song.id] = known
    if (read >= TAGS_PER_RUN) continue

    const copy = await bucket.head(song.id)
    if (copy?.customMetadata?.driveModifiedTime !== song.modifiedTime) continue
    try {
      next[song.id] = {
        modifiedTime: song.modifiedTime,
        ...(await readTextTags(bucket, song.id)),
      }
      read += 1
      changed = true
    } catch {
      /* unreadable for now; the next run tries again */
    }
  }

  const removed = Object.keys(stored).some((id) => !(id in next))
  if (changed || removed) {
    await bucket.put(CATALOG_KEY, JSON.stringify(next), {
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
        cacheControl: "public, max-age=60",
      },
    })
  }
  return read
}
