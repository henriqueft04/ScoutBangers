export default async function handler(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
