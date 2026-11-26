/**
 * Whether the request's `Origin` is one of the comma-separated hosts in
 * `allowedOrigins` (or a subdomain of one). A request without an `Origin`
 * is refused: browsers always send it on a WebSocket handshake.
 */
export function originAllowed(request: Request, allowedOrigins: string): boolean {
  const origin = request.headers.get("Origin")
  if (!origin) return false
  let hostname: string
  try {
    hostname = new URL(origin).hostname
  } catch {
    return false
  }
  return allowedOrigins.split(",").some((allowed) => {
    const host = allowed.trim()
    return hostname === host || hostname.endsWith(`.${host}`)
  })
}
