import { getDriveAccessToken } from './functions/api/_lib/drive-auth.ts';
import fs from 'fs';

async function test() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const googleJson = env.split('GOOGLE_SERVICE_ACCOUNT_JSON=')[1].split('\n')[0].replace(/^'|'$/g, '');
  const token = await getDriveAccessToken(googleJson);
  
  const boundary = "-------314159265358979323846"
  const startBoundary = `--${boundary}\r\n`
  const midBoundary = `\r\n--${boundary}\r\n`
  const endBoundary = `\r\n--${boundary}--`

  const metadata = { name: "test.mp3", mimeType: "audio/mpeg" }
  const metaDataPart = 
    startBoundary +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` + 
    JSON.stringify(metadata)
  
  const fileDataPart = midBoundary + `Content-Type: audio/mpeg\r\n\r\n`
  const taggedMp3 = new Uint8Array([0, 1, 2, 3])

  const metaBuffer = new TextEncoder().encode(metaDataPart + fileDataPart)
  const closeBuffer = new TextEncoder().encode(endBoundary)

  const body = new Uint8Array(metaBuffer.byteLength + taggedMp3.byteLength + closeBuffer.byteLength)
  body.set(metaBuffer, 0)
  body.set(new Uint8Array(taggedMp3), metaBuffer.byteLength)
  body.set(closeBuffer, metaBuffer.byteLength + taggedMp3.byteLength)

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  })
  
  console.log(uploadRes.status, await uploadRes.text())
}

test().catch(console.error)
