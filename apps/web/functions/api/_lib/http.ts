/** A JSON response; `headers` are added to the content type. */
export const json = (
  body: unknown,
  status = 200,
  headers?: HeadersInit
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  })
