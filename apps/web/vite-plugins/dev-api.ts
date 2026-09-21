import { promises as fs } from "node:fs"
import path from "node:path"

import { loadEnv, type Plugin } from "vite"

/**
 * Dev-time middleware that runs the Cloudflare Pages Functions in
 * `apps/web/functions/api/` inside the Vite dev server. Without this,
 * `npm run dev` returns the raw `.ts` source for `/api/*` requests.
 *
 * Pages Functions export named handlers (`onRequestGet`, `onRequest`, …)
 * that receive a context object `{ request, env, params }`. Locally we
 * inject `env` from `process.env` (loaded from `.env.local`) so the same
 * code works in dev as in prod.
 *
 * Production traffic never touches this plugin — Cloudflare runs the
 * same files directly as Pages Functions.
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
      const apiRoot = path.resolve(server.config.root, "functions/api")

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.method) return next()
        if (!req.url.startsWith("/api/")) return next()

        const requestUrl = new URL(req.url, "http://localhost")
        const segments = requestUrl.pathname
          .replace(/^\/api\//, "")
          .split("/")
          .filter(Boolean)

        const resolved = await resolveHandlerPath(apiRoot, segments)
        if (!resolved) return next()

        try {
          const mod = await server.ssrLoadModule(resolved.filePath)
          const methodHandler = `onRequest${capitalize(req.method.toLowerCase())}`
          const handler =
            (mod[methodHandler] as PagesHandler | undefined) ??
            (mod.onRequest as PagesHandler | undefined)

          if (typeof handler !== "function") {
            res.statusCode = 500
            res.end(
              `Handler at ${resolved.filePath} has no ${methodHandler} or onRequest export`
            )
            return
          }

          const webRequest = await toWebRequest(req, requestUrl)
          const webResponse = await handler({
            request: webRequest,
            env: { ...process.env },
            params: resolved.params,
            data: {},
            next: async () => new Response(null, { status: 404 }),
            waitUntil: () => {},
            passThroughOnException: () => {},
          })
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

interface ResolvedHandler {
  filePath: string
  params: Record<string, string>
}

interface PagesContext {
  request: Request
  env: Record<string, string | undefined>
  params: Record<string, string>
  data: Record<string, unknown>
  next: () => Promise<Response>
  waitUntil: (promise: Promise<unknown>) => void
  passThroughOnException: () => void
}

type PagesHandler = (
  context: PagesContext
) => Promise<Response> | Response

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

async function resolveHandlerPath(
  apiRoot: string,
  segments: string[]
): Promise<ResolvedHandler | null> {
  if (segments.length === 0) return null

  const direct = path.join(apiRoot, segments.join("/") + ".ts")
  if (await exists(direct)) return { filePath: direct, params: {} }

  if (segments.length > 1) {
    // Try [id].ts at the end
    const dynamicEnd = path.join(
      apiRoot,
      ...segments.slice(0, -1),
      "[id].ts"
    )
    if (await exists(dynamicEnd)) {
      return {
        filePath: dynamicEnd,
        params: { id: segments[segments.length - 1]! },
      }
    }

    // Try [id] directory with a trailing file (e.g. submissions/[id]/approve.ts)
    if (segments.length > 2) {
      const dynamicMid = path.join(
        apiRoot,
        ...segments.slice(0, -2),
        "[id]",
        segments[segments.length - 1]! + ".ts"
      )
      if (await exists(dynamicMid)) {
        return {
          filePath: dynamicMid,
          params: { id: segments[segments.length - 2]! },
        }
      }
    }
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

async function toWebRequest(
  req: import("node:http").IncomingMessage,
  url: URL
): Promise<Request> {
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

  if (req.method !== "GET" && req.method !== "HEAD") {
    const buffers: Buffer[] = []
    for await (const chunk of req) {
      buffers.push(chunk)
    }
    init.body = Buffer.concat(buffers)
  }

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
