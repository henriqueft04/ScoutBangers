/**
 * The song catalog: the text tags of every song, read once on the server
 * (workers/drive-sync, while it mirrors Drive to R2) and published as one
 * small JSON object next to the audio. `/api/songs` merges it into the song
 * list, so every visitor knows each song's artist and album straight away,
 * instead of every browser reading them out of the audio files one by one.
 *
 * Shared by the sync worker (which writes it) and the Pages function (which
 * reads it).
 */

/** Object key of the catalog in the audio bucket. Drive ids never contain a dot. */
export const CATALOG_KEY = "_catalog.json"

export interface CatalogEntry {
  /** The Drive modifiedTime the tags were read at. */
  modifiedTime: string
  artist?: string
  album?: string
}

/** Entries by Drive file id. */
export type Catalog = Record<string, CatalogEntry>
