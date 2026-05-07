import { promises as fs } from "node:fs"
import path from "node:path"

import { loadEnv, type Plugin } from "vite"

/**
 * Dev-time middleware that runs the Vercel Edge functions in `apps/web/api/`
 * inside the Vite dev server. Without this, `npm run dev` returns the raw
 * `.ts` source for `/api/*` requests, breaking the SPA.
 *
 * Behaviour:
 *   - Loads all variables from `.env.local` / `.env` into `process.env` so the
 *     handlers see DRIVE_API_KEY etc. just like in production.
 *   - Maps `/api/foo` → `api/foo.ts` and `/api/foo/<id>` → `api/foo/[id].ts`.
 *   - Bridges Node's `IncomingMessage` to a Web `Request`, runs the handler,
 *     and writes the resulting `Response` (including streamed bodies and
 *     status codes) back to the Node `ServerResponse`.
 *
 * Production traffic never touches this plugin — Vercel runs the same files
 * directly as Edge functions.
 */
export function devApi(): Plugin {
  return {
    name: "dev-api",
    apply: "serve",
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), "")
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) {
          process.env[key] = value
        }
      }
    },
    configureServer(server) {
      const apiRoot = path.resolve(server.config.root, "api")

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.method) return next()
        if (!req.url.startsWith("/api/")) return next()

        const requestUrl = new URL(req.url, "http://localhost")
        const segments = requestUrl.pathname
          .replace(/^\/api\//, "")
          .split("/")
          .filter(Boolean)

        const filePath = await resolveHandlerPath(apiRoot, segments)
        if (!filePath) return next()

        try {
          const mod = await server.ssrLoadModule(filePath)
          const handler = mod.default as
            | ((request: Request) => Promise<Response> | Response)
            | undefined

          if (typeof handler !== "function") {
            res.statusCode = 500
            res.end(`Handler at ${filePath} has no default export`)
            return
          }

          const webRequest = toWebRequest(req, requestUrl)
          const webResponse = await handler(webRequest)
          await writeWebResponse(webResponse, res)
        } catch (error) {
          console.error("[dev-api]", error)
          res.statusCode = 500
          res.setHeader("Content-Type", "text/plain; charset=utf-8")
          res.end(
            error instanceof Error
              ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
              : String(error)
          )
        }
      })
    },
  }
}

async function resolveHandlerPath(
  apiRoot: string,
  segments: string[]
): Promise<string | null> {
  if (segments.length === 0) return null

  // Try exact: api/<a>/<b>.ts
  const direct = path.join(apiRoot, segments.join("/") + ".ts")
  if (await exists(direct)) return direct

  // Try dynamic: api/<a>/[id].ts where last segment is the id.
  if (segments.length > 1) {
    const dynamic = path.join(
      apiRoot,
      ...segments.slice(0, -1),
      "[id].ts"
    )
    if (await exists(dynamic)) return dynamic
  }

  return null
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function toWebRequest(
  req: import("node:http").IncomingMessage,
  url: URL
): Request {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (typeof value === "string") {
      headers.set(key, value)
    }
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  }

  // Bodies aren't needed for our GET-only API; add support if it ever changes.
  return new Request(url.toString(), init)
}

async function writeWebResponse(
  webResponse: Response,
  res: import("node:http").ServerResponse
): Promise<void> {
  res.statusCode = webResponse.status
  webResponse.headers.forEach((value, key) => {
    // Node sets Content-Length itself when we write a Buffer; trying to set
    // it can cause mismatches when transfer encoding kicks in.
    if (key.toLowerCase() === "content-length") return
    res.setHeader(key, value)
  })
  if (webResponse.body) {
    const buffer = Buffer.from(await webResponse.arrayBuffer())
    res.end(buffer)
  } else {
    res.end()
  }
}
