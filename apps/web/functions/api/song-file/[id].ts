/**
 * Admin-only read/write of a song's audio file on Drive, used by the
 * admin panel's metadata editor.
 *
 *  GET → streams the current Drive file (so the editor always starts from
 *        the latest bytes, not the up-to-15-min-old R2 mirror) and reports
 *        its `modifiedTime` in `X-Drive-Modified-Time`. Honors `Range`.
 *  PUT → replaces the file's content in place. The Drive file ID never
 *        changes (it's a new *revision* of the same file), so play counts,
 *        favourites and playlists — all keyed by that ID — are untouched.
 *        The old revision is pinned so it can be restored from Drive.
 *
 * PUT requires `X-Base-Modified-Time` (what GET returned) and fails with
 * 409 if the file changed in the meantime, so two edits can't silently
 * overwrite each other. Only MP3 files inside DRIVE_FOLDER_ID can be edited.
 */

import { requireAdmin, type AdminEnv } from "../_lib/admin"
import { getDriveAccessToken } from "../_lib/drive-auth"

interface Env extends AdminEnv {
  GOOGLE_SERVICE_ACCOUNT_JSON?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_REFRESH_TOKEN?: string
  DRIVE_FOLDER_ID: string
  SYNC_WORKER_URL?: string
  SYNC_WORKER_TOKEN?: string
}

interface DriveMeta {
  id: string
  name: string
  mimeType: string
  parents?: string[]
  modifiedTime: string
}

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files"
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
const MAX_BYTES = 60 * 1024 * 1024

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
}

async function getMeta(id: string, token: string, env: Env): Promise<DriveMeta | Response> {
  const res = await fetch(
    `${DRIVE_FILES}/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,modifiedTime`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (res.status === 404) return json({ error: "Música não encontrada no Drive." }, 404)
  if (!res.ok) return json({ error: `Drive: ${res.status}` }, 502)
  const meta = (await res.json()) as DriveMeta
  if (!meta.parents?.includes(env.DRIVE_FOLDER_ID) || !meta.mimeType.startsWith("audio/")) {
    return json({ error: "Este ficheiro não faz parte do catálogo." }, 403)
  }
  const isMp3 = meta.mimeType === "audio/mpeg" || /\.mp3$/i.test(meta.name)
  if (!isMp3) {
    return json({ error: "Só é possível editar ficheiros MP3." }, 415)
  }
  return meta
}

/** Strip path separators / control chars; always end in .mp3. */
function safeName(raw: string): string {
  const base = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/\u0000-\u001f]/g, " ")
    .replace(/\.mp3$/i, "")
    .replace(/\s+/g, " ")
    .trim()
  return `${base || "Sem título"}.mp3`
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = params.id as string
  // Admin check and Drive token are independent: run them together.
  const [admin, token] = await Promise.all([
    requireAdmin(request, env),
    getDriveAccessToken(env),
  ])
  if (!admin.ok) return json({ error: admin.error }, admin.status)

  // Start the download alongside the metadata check. A `Range` header is
  // passed through so the editor can read just the tags at the front of
  // the file instead of the whole song.
  const range = request.headers.get("Range")
  const [meta, upstream] = await Promise.all([
    getMeta(id, token, env),
    fetch(`${DRIVE_FILES}/${encodeURIComponent(id)}?alt=media&acknowledgeAbuse=true`, {
      headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) },
    }),
  ])
  if (meta instanceof Response) {
    upstream.body?.cancel().catch(() => undefined)
    return meta
  }
  if (!upstream.ok || !upstream.body) {
    return json({ error: `Drive download: ${upstream.status}` }, 502)
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Drive-Modified-Time": meta.modifiedTime,
      "X-Drive-Name": encodeURIComponent(meta.name),
    },
  })
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const [admin, token] = await Promise.all([
    requireAdmin(request, env),
    getDriveAccessToken(env),
  ])
  if (!admin.ok) return json({ error: admin.error }, admin.status)

  const id = params.id as string
  const baseModified = request.headers.get("X-Base-Modified-Time")
  if (!baseModified) return json({ error: "Falta X-Base-Modified-Time." }, 400)

  const rawName = request.headers.get("X-Song-Name")
  const newName = rawName ? safeName(decodeURIComponent(rawName)) : null

  const bytes = await request.arrayBuffer()
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return json({ error: "Ficheiro inválido ou demasiado grande." }, 413)
  }
  // An MP3 starts with an ID3 tag ("ID3") or an MPEG frame sync (0xFF 0xEx).
  const head = new Uint8Array(bytes, 0, 3)
  const looksLikeMp3 =
    (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) ||
    (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)
  if (!looksLikeMp3) return json({ error: "O ficheiro não parece um MP3." }, 400)

  const meta = await getMeta(id, token, env)
  if (meta instanceof Response) return meta
  if (meta.modifiedTime !== baseModified) {
    return json(
      { error: "A música foi alterada entretanto. Fecha e volta a abrir o editor." },
      409
    )
  }

  const boundary = `sb-${crypto.randomUUID()}`
  const enc = new TextEncoder()
  const head1 = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(newName ? { name: newName } : {}) +
      `\r\n--${boundary}\r\nContent-Type: audio/mpeg\r\n\r\n`
  )
  const tail = enc.encode(`\r\n--${boundary}--`)
  const body = new Uint8Array(head1.byteLength + bytes.byteLength + tail.byteLength)
  body.set(head1, 0)
  body.set(new Uint8Array(bytes), head1.byteLength)
  body.set(tail, head1.byteLength + bytes.byteLength)

  // PATCH on the existing ID = a new revision of the same file.
  // keepRevisionForever pins it so Drive doesn't prune the history.
  const upload = await fetch(
    `${DRIVE_UPLOAD}/${encodeURIComponent(id)}?uploadType=multipart&keepRevisionForever=true&fields=id,name,modifiedTime`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )
  if (!upload.ok) {
    return json({ error: `Drive upload: ${upload.status} ${await upload.text()}` }, 502)
  }
  const saved = (await upload.json()) as { name: string; modifiedTime: string }

  // Mirror to R2 now instead of waiting for the 15-minute cron.
  let synced = false
  if (env.SYNC_WORKER_URL && env.SYNC_WORKER_TOKEN) {
    const url = new URL(env.SYNC_WORKER_URL)
    url.searchParams.set("token", env.SYNC_WORKER_TOKEN)
    synced = await fetch(url.toString())
      .then((r) => r.ok)
      .catch(() => false)
  }

  return json({ ok: true, name: saved.name, modifiedTime: saved.modifiedTime, synced })
}
