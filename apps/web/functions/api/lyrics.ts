import { getDriveAccessToken } from "./_lib/drive-auth"

interface Env {
  LYRICS_DRIVE_FILE_ID: string
  GOOGLE_SERVICE_ACCOUNT_JSON: string
}

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
const HTML_MIME = "text/html"

interface LyricsPayload {
  modifiedTime: string | null
  songs: Record<string, string>
  anchors: Record<string, string>
  docUrl: string
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

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", Aacute: "Á",
  agrave: "à", Agrave: "À",
  acirc: "â", Acirc: "Â",
  atilde: "ã", Atilde: "Ã",
  auml: "ä", Auml: "Ä",
  eacute: "é", Eacute: "É",
  egrave: "è", Egrave: "È",
  ecirc: "ê", Ecirc: "Ê",
  euml: "ë", Euml: "Ë",
  iacute: "í", Iacute: "Í",
  igrave: "ì", Igrave: "Ì",
  icirc: "î", Icirc: "Î",
  iuml: "ï", Iuml: "Ï",
  oacute: "ó", Oacute: "Ó",
  ograve: "ò", Ograve: "Ò",
  ocirc: "ô", Ocirc: "Ô",
  otilde: "õ", Otilde: "Õ",
  ouml: "ö", Ouml: "Ö",
  uacute: "ú", Uacute: "Ú",
  ugrave: "ù", Ugrave: "Ù",
  ucirc: "û", Ucirc: "Û",
  uuml: "ü", Uuml: "Ü",
  ccedil: "ç", Ccedil: "Ç",
  ntilde: "ñ", Ntilde: "Ñ",
  ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»",
  bull: "•", middot: "·",
  copy: "©", reg: "®", trade: "™",
  deg: "°", ordf: "ª", ordm: "º",
  iexcl: "¡", iquest: "¿",
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    )
    .replace(/&([a-zA-Z]+);/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)
        ? NAMED_ENTITIES[name]!
        : match
    )
}

function stripChordSpans(html: string): string {
  return html.replace(
    /<(span|font)[^>]*\bstyle\s*=\s*"[^"]*color\s*:\s*#0ba6b8[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi,
    ""
  )
}

function htmlBlockToText(html: string): string {
  return decodeHtmlEntities(
    stripChordSpans(html)
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/p\s*>/gi, "\n")
      .replace(/<\s*\/li\s*>/gi, "\n")
      .replace(/<\s*\/div\s*>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trim()
}

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

function bodyParagraphs(html: string): Paragraph[] {
  const out: Paragraph[] = []
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const inner = m[1] ?? ""
    const bold = /font-weight\s*:\s*(7|800|900|bold)/i.test(inner)
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
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

interface HeadingMatch {
  level: number
  title: string
  anchor: string | null
  start: number
  end: number
}

function findHeadings(html: string): HeadingMatch[] {
  const out: HeadingMatch[] = []
  const re = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const inner = m[2] ?? ""
    const anchorMatch = /<a\s+[^>]*id\s*=\s*"_([^"]+)"/i.exec(inner)
    out.push({
      level: parseInt(m[1]!.slice(1), 10),
      title: htmlBlockToText(inner),
      anchor: anchorMatch ? anchorMatch[1]! : null,
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  return out
}

function parseHtml(
  html: string
): Pick<LyricsPayload, "songs" | "anchors" | "titles"> {
  const songs: Record<string, string> = {}
  const anchors: Record<string, string> = {}
  const titles: string[] = []
  const headings = findHeadings(html)

  type Section = { songLevel: 2 | 3; headings: HeadingMatch[] }
  const sections: Section[] = []
  let current: Section | null = null
  for (const h of headings) {
    if (h.level === 1) {
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
      let bodyEnd = html.length
      for (let j = i + 1; j < section.headings.length; j++) {
        if (section.headings[j]!.level <= section.songLevel) {
          bodyEnd = section.headings[j]!.start
          break
        }
      }
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
      if (h.anchor) anchors[key] = h.anchor
      titles.push(h.title)
    }
  }
  return { songs, anchors, titles }
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.LYRICS_DRIVE_FILE_ID) {
    return new Response(
      "Server misconfigured: LYRICS_DRIVE_FILE_ID is unset.",
      { status: 500 }
    )
  }

  let token: string
  try {
    token = await getDriveAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON)
  } catch (error) {
    return new Response(
      `Drive auth failed: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 }
    )
  }

  const fileId = env.LYRICS_DRIVE_FILE_ID
  const metaUrl = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?fields=modifiedTime`
  const exportUrl = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(HTML_MIME)}`
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
    return new Response(
      `Drive returned ${exportResponse.status}: ${detail.slice(0, 400)}`,
      { status: 502 }
    )
  }

  const html = await exportResponse.text()

  let modifiedTime: string | null = null
  if (metaResponse.ok) {
    try {
      const j = (await metaResponse.json()) as { modifiedTime?: string }
      modifiedTime = j.modifiedTime ?? null
    } catch {
      /* ignore */
    }
  }

  const payload: LyricsPayload = {
    modifiedTime,
    docUrl: `https://docs.google.com/document/d/${encodeURIComponent(fileId)}/edit`,
    ...parseHtml(html),
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=82800",
    },
  })
}
