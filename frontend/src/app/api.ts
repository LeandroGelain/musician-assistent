const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export async function apiRequest<T>(
  path: string,
  method: HttpMethod = 'GET',
  body?: unknown,
): Promise<T> {
  const isFormData = body instanceof FormData

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: isFormData
      ? undefined
      : {
          'Content-Type': 'application/json',
        },
    body: body ? (isFormData ? (body as FormData) : JSON.stringify(body)) : undefined,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Erro na requisição')
  }

  if (response.status === 204 || response.status === 205) {
    return null as T
  }

  const contentLength = response.headers.get('content-length')
  const contentType = response.headers.get('content-type')

  // Some successful endpoints (commonly DELETE) can return 200 with an empty body.
  if (contentLength === '0' || !contentType) {
    return null as T
  }

  return (await response.json()) as T
}
