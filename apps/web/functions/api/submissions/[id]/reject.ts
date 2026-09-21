import { bearerToken, verifyJwt, type JwtEnv } from "../../_lib/jwt"

interface Env extends JwtEnv {
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_ANON_KEY: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const submissionId = params.id as string
  if (!submissionId) return json({ error: "Missing ID" }, 400)

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
  if (sub.status !== "pending") return json({ error: "Submission is not pending" }, 400)

  const updateReq = await fetch(`${supabaseUrl}/rest/v1/song_submissions?id=eq.${submissionId}`, {
    method: "PATCH",
    headers: {
      "apikey": env.VITE_SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status: "rejected" })
  })
  if (!updateReq.ok) return json({ error: "Failed to update submission status" }, 500)

  return json({ success: true })
}
