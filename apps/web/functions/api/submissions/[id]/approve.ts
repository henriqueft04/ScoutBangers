import { bearerToken, verifyJwt, type JwtEnv } from "../../_lib/jwt"
import { getDriveAccessToken } from "../../_lib/drive-auth"
import { ID3Writer } from "browser-id3-writer"

interface Env extends JwtEnv {
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  GOOGLE_SERVICE_ACCOUNT_JSON?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_REFRESH_TOKEN?: string
  DRIVE_FOLDER_ID: string
  SYNC_WORKER_URL: string
  SYNC_WORKER_TOKEN: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { request, env, params } = context
    const submissionId = params.id as string
  if (!submissionId) return json({ error: "Missing ID" }, 400)

  let overrides: Record<string, string> = {}
  try {
    overrides = await request.json()
  } catch (e) {
    // optional body
  }

  const token = bearerToken(request)
  if (!token) return json({ error: "Unauthorized" }, 401)

  const jwt = await verifyJwt(token, env)
  if (!jwt.ok) return json({ error: "Invalid token" }, 401)

  const supabaseUrl = env.VITE_SUPABASE_URL
  const getSubReq = await fetch(`${supabaseUrl}/rest/v1/song_submissions?id=eq.${submissionId}&select=*`, {
    headers: {
      "apikey": env.VITE_SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`
    }
  })
  if (!getSubReq.ok) return json({ error: "Failed to fetch submission" }, 500)
  const submissions = await getSubReq.json() as any[]
  if (!submissions || submissions.length === 0) return json({ error: "Submission not found or unauthorized" }, 404)
  
  const sub = submissions[0]
  if (sub.status !== "pending" && sub.status !== "rejected") {
    return json({ error: "Submission is not pending or rejected" }, 400)
  }

  const mp3Req = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/submissions/${sub.audio_path}`, {
    headers: { "Authorization": `Bearer ${token}` }
  })
  if (!mp3Req.ok) return json({ error: "Failed to download MP3" }, 500)
  const mp3Buffer = await mp3Req.arrayBuffer()

  let coverBuffer: ArrayBuffer | null = null
  if (sub.thumbnail_path) {
    const coverReq = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/submissions/${sub.thumbnail_path}`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
    if (coverReq.ok) {
      coverBuffer = await coverReq.arrayBuffer()
    }
  }

  const finalTitle = overrides.title || sub.title
  const finalArtist = overrides.artist || sub.artist
  const finalAlbum = overrides.album !== undefined ? overrides.album : sub.album
  const finalYear = overrides.year !== undefined ? overrides.year : sub.year
  const finalGenre = overrides.genre !== undefined ? overrides.genre : sub.genre

  const writer = new (ID3Writer as any)(mp3Buffer)
  writer.setFrame("TIT2", finalTitle)
  writer.setFrame("TPE1", [finalArtist])
  if (finalAlbum) writer.setFrame("TALB", finalAlbum)
  if (finalYear) writer.setFrame("TYER", parseInt(finalYear, 10))
  if (finalGenre) writer.setFrame("TCON", [finalGenre])
  if (coverBuffer) {
    writer.setFrame("APIC", {
      type: 3,
      data: coverBuffer,
      description: "Cover",
      useUnicodeEncoding: false
    })
  }
  writer.addTag()
  const taggedMp3 = writer.arrayBuffer

  const driveToken = await getDriveAccessToken(env)
  
  const metadata = {
    name: `${finalArtist} - ${finalTitle}.mp3`,
    parents: [env.DRIVE_FOLDER_ID],
    mimeType: "audio/mpeg"
  }
  
  const boundary = "-------314159265358979323846"
  const startBoundary = `--${boundary}\r\n`
  const midBoundary = `\r\n--${boundary}\r\n`
  const endBoundary = `\r\n--${boundary}--`

  const metaDataPart = 
    startBoundary +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` + 
    JSON.stringify(metadata)
  
  const fileDataPart = midBoundary + `Content-Type: audio/mpeg\r\n\r\n`

  const metaBuffer = new TextEncoder().encode(metaDataPart + fileDataPart)
  const closeBuffer = new TextEncoder().encode(endBoundary)

  const body = new Uint8Array(metaBuffer.byteLength + taggedMp3.byteLength + closeBuffer.byteLength)
  body.set(metaBuffer, 0)
  body.set(new Uint8Array(taggedMp3), metaBuffer.byteLength)
  body.set(closeBuffer, metaBuffer.byteLength + taggedMp3.byteLength)

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${driveToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  })

  if (!uploadRes.ok) {
    const details = await uploadRes.text()
    return json({ error: `Drive upload failed: ${details}` }, 500)
  }

  const updateReq = await fetch(`${supabaseUrl}/rest/v1/song_submissions?id=eq.${submissionId}`, {
    method: "PATCH",
    headers: {
      "apikey": env.VITE_SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ 
      status: "approved",
      title: finalTitle,
      artist: finalArtist,
      album: finalAlbum,
      year: finalYear,
      genre: finalGenre
    })
  })
  if (!updateReq.ok) return json({ error: "Failed to update submission status" }, 500)

  await fetch(`${supabaseUrl}/storage/v1/object/submissions`, {
    method: "DELETE",
    headers: {
      "apikey": env.VITE_SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prefixes: [sub.audio_path, sub.thumbnail_path].filter(Boolean) })
  })

  if (env.SYNC_WORKER_URL && env.SYNC_WORKER_TOKEN) {
    const syncUrl = new URL(env.SYNC_WORKER_URL)
    syncUrl.searchParams.set("token", env.SYNC_WORKER_TOKEN)
    await fetch(syncUrl.toString(), { method: "GET" }).catch(console.error)
  }

  return json({ success: true })
  } catch (err) {
    return json({ error: "Caught exception in approve.ts", details: err instanceof Error ? err.stack : String(err) }, 500)
  }
}
