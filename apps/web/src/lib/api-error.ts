/** The `error` message of a failed `/api/*` response, or a generic one. */
export async function apiErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error) return body.error
  } catch {
    /* fall through */
  }
  return `Erro ${response.status}`
}
