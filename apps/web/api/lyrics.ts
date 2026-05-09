import mammoth from "mammoth"

import { getDriveAccessToken } from "./_lib/drive-auth.js"

/**
 * GET /api/lyrics — Node function (mammoth is not Edge-compatible).
 *
 * Fetches the configured Google Doc lyrics file from Drive, parses
 * the .docx export with mammoth into markdown, splits by headings
 * into a normalized-title → lyrics map, and returns it as JSON.
 *
 * The doc is expected to have one heading per song (any heading
 * level), with the song's lyrics as the body until the next heading.
 *
 * Cached aggressively at the edge — the doc rarely changes minute-
 * by-minute, and the browser maintains its own 24 h IDB cache on
 * top of this anyway.
 */

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

interface LyricsPayload {
  /** ISO timestamp from Drive's modifiedTime, for staleness detection. */
  modifiedTime: string | null
  /** Map of normalized song title → lyrics body. */
  songs: Record<string, string>
  /** Original (display) titles, for debugging / future fuzzy match. */
  titles: string[]
}

function normalizeTitle(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    )
}

function htmlBlockToText(html: string): string {
  return decodeHtmlEntities(
    html
      // Block-level breaks → newlines.
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/p\s*>/gi, "\n")
      .replace(/<\s*\/li\s*>/gi, "\n")
      .replace(/<\s*\/div\s*>/gi, "\n")
      // Strip the rest of the tags.
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trim()
}

/**
 * Heuristic check: is this line nothing but chord notation? In the
 * Cancioneiro the chord lines look like `Am 	    	 C 	     G 	 D`
 * — short tokens of chord shapes separated by whitespace. We can't
 * use the doc's colour to identify them (mammoth strips colour),
 * so we match by token shape.
 *
 * A chord token: a root note (A–G), optional accidental (#/b),
 * optional quality (m, maj, min, sus, aug, dim), optional digit
 * (7, 9, 11, 13), optional sus2/sus4/add9/etc. tail, and an
 * optional /bass-note slash. Examples that match:
 *   C, Cm, C9, F#7, Bb, Em, Am7, Dsus4, F#7sus4, C/G
 */
const CHORD_TOKEN_RE =
  /^[A-G][#b]?(?:m|maj|min|sus|aug|dim|MAJ|MIN)?\d{0,2}(?:sus[24]|add\d{1,2})?(?:\/[A-G][#b]?)?$/

function isChordOnlyLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/[^\x00-\x7F]/.test(trimmed)) return false
  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 0) return false
  return tokens.every((token) => CHORD_TOKEN_RE.test(token))
}

interface Paragraph {
  text: string
  bold: boolean
}

/**
 * Walk the paragraphs in the song body, strip chord-only lines,
 * and insert a blank line whenever the bold-state changes between
 * successive lyric lines. The Cancioneiro uses bold to mark
 * chorus / refrão sections — without an explicit transition the
 * lyrics would otherwise read as a single wall of text after the
 * chord lines are removed.
 */
function bodyParagraphs(html: string): Paragraph[] {
  const out: Paragraph[] = []
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const inner = m[1] ?? ""
    // Bold paragraph either wraps its content in <strong>, or every
    // text run inside it is bold. Treat the wrap-in-strong case as
    // 'bold paragraph' since that's how mammoth emits it for the
    // Cancioneiro's chorus sections.
    const trimmedInner = inner.trim()
    const bold =
      /^<strong[^>]*>[\s\S]*<\/strong>$/i.test(trimmedInner) &&
      !/<\/?strong[^>]*>/i.test(
        trimmedInner.replace(/^<strong[^>]*>|<\/strong>$/gi, "")
      )
    const text = htmlBlockToText(inner)
    if (text.length === 0) continue
    out.push({ text, bold })
  }
  return out
}

function bodyToText(html: string): string {
  const paras = bodyParagraphs(html)
  const lines: string[] = []
  let lastBold: boolean | null = null
  for (const p of paras) {
    if (isChordOnlyLine(p.text)) continue
    if (lastBold !== null && p.bold !== lastBold) {
      lines.push("")
    }
    lines.push(p.text)
    lastBold = p.bold
  }
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

interface HeadingMatch {
  level: number
  title: string
  start: number
  end: number
}

function findHeadings(html: string): HeadingMatch[] {
  const out: HeadingMatch[] = []
  const re = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    out.push({
      level: parseInt(m[1]!.slice(1), 10),
      title: htmlBlockToText(m[2] ?? ""),
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  return out
}

/**
 * The Cancioneiro is organised as H1 sections. Within each section
 * the song level isn't uniform:
 *   - Most sections (e.g. "680-Santão", "Cenáculo", "Músicas
 *     Escutistas", "Músicas Igreja") put songs at H2.
 *   - "Outros Agrupamentos" puts H2 = sub-group / agrupamento
 *     header and H3 = the actual song.
 *
 * Rather than hard-coding which H1 is which, auto-detect per
 * section: if the section contains any H3, songs are at H3 (and
 * H2s are sub-group headers to skip); otherwise songs are at H2.
 *
 * The body of each song = HTML between its heading and the next
 * heading at level <= songLevel for that section (next song, next
 * sub-group, or next H1).
 */
function parseHtml(html: string): Pick<LyricsPayload, "songs" | "titles"> {
  const songs: Record<string, string> = {}
  const titles: string[] = []
  const headings = findHeadings(html)

  // Group headings by H1 section so we can pick the right songLevel
  // for each section based on what's inside it.
  type Section = { songLevel: 2 | 3; headings: HeadingMatch[] }
  const sections: Section[] = []
  let current: Section | null = null
  for (const h of headings) {
    if (h.level === 1) {
      // Skip the Índice TOC and empty-title page-break artefacts.
      if (!h.title || normalizeTitle(h.title) === "indice") {
        current = null
        continue
      }
      current = { songLevel: 2, headings: [] }
      sections.push(current)
      continue
    }
    if (!current) continue
    current.headings.push(h)
    if (h.level === 3) current.songLevel = 3
  }

  for (const section of sections) {
    for (let i = 0; i < section.headings.length; i++) {
      const h = section.headings[i]!
      if (h.level !== section.songLevel) continue
      if (!h.title) continue
      // Body runs to the next heading inside this section at level
      // <= songLevel. If we're at the end of the section, use the
      // start of the next H1 (or end of doc).
      let bodyEnd = html.length
      for (let j = i + 1; j < section.headings.length; j++) {
        if (section.headings[j]!.level <= section.songLevel) {
          bodyEnd = section.headings[j]!.start
          break
        }
      }
      // Also bounded by the next H1 in the global headings list.
      const allIdx = headings.indexOf(h)
      for (let k = allIdx + 1; k < headings.length; k++) {
        if (headings[k]!.level === 1) {
          bodyEnd = Math.min(bodyEnd, headings[k]!.start)
          break
        }
      }
      const body = bodyToText(html.slice(h.end, bodyEnd))
      if (!body) continue
      const key = normalizeTitle(h.title)
      if (!key || songs[key]) continue
      songs[key] = body
      titles.push(h.title)
    }
  }
  return { songs, titles }
}

export default async function handler(
  _request: Request
): Promise<Response> {
  const fileId = process.env.LYRICS_DRIVE_FILE_ID
  if (!fileId) {
    return new Response(
      "Server misconfigured: LYRICS_DRIVE_FILE_ID is unset.",
      { status: 500 }
    )
  }

  let token: string
  try {
    token = await getDriveAccessToken()
  } catch (error) {
    return new Response(
      `Drive auth failed: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 }
    )
  }

  // Fetch modifiedTime in parallel with the export so we can include
  // it in the response for client-side cache invalidation.
  const metaUrl = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?fields=modifiedTime`
  const exportUrl = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(DOCX_MIME)}`
  const headers = { Authorization: `Bearer ${token}` }

  let metaResponse: Response
  let exportResponse: Response
  try {
    ;[metaResponse, exportResponse] = await Promise.all([
      fetch(metaUrl, { headers }),
      fetch(exportUrl, { headers }),
    ])
  } catch (error) {
    return new Response(
      `Drive fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      { status: 502 }
    )
  }

  if (!exportResponse.ok) {
    const detail = await exportResponse.text()
    // Files uploaded as .docx (not native Google Docs) don't support
    // export — fall back to direct download.
    if (exportResponse.status === 403 || exportResponse.status === 400) {
      const fallbackUrl = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`
      try {
        exportResponse = await fetch(fallbackUrl, { headers })
      } catch (error) {
        return new Response(
          `Drive media fetch failed: ${error instanceof Error ? error.message : String(error)}`,
          { status: 502 }
        )
      }
      if (!exportResponse.ok) {
        return new Response(
          `Drive returned ${exportResponse.status}`,
          { status: 502 }
        )
      }
    } else {
      return new Response(
        `Drive returned ${exportResponse.status}: ${detail.slice(0, 400)}`,
        { status: 502 }
      )
    }
  }

  const arrayBuffer = await exportResponse.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let html: string
  try {
    const result = await mammoth.convertToHtml({ buffer })
    html = result.value
  } catch (error) {
    return new Response(
      `Could not parse .docx: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 }
    )
  }

  let modifiedTime: string | null = null
  if (metaResponse.ok) {
    try {
      const json = (await metaResponse.json()) as { modifiedTime?: string }
      modifiedTime = json.modifiedTime ?? null
    } catch {
      /* ignore */
    }
  }

  const payload: LyricsPayload = {
    modifiedTime,
    ...parseHtml(html),
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Edge cache: 1 h fresh, 23 h stale-while-revalidate. Combined
      // with the browser's IDB cache we hit Drive at most a few times
      // a day per region.
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=82800",
    },
  })
}
