import { apiRequest } from '../../app/api'

export type RepertorioItem = {
  id: number
  title: string
  artist: string
  notes: string
}

export type RepertorioPayload = {
  title: string
  artist: string
  notes: string
}

export function listRepertorio(): Promise<RepertorioItem[]> {
  return apiRequest<RepertorioItem[]>('/api/repertorio')
}

export function createRepertorioItem(
  payload: RepertorioPayload,
): Promise<RepertorioItem> {
  return apiRequest<RepertorioItem>('/api/repertorio', 'POST', payload)
}

export function deleteRepertorioItem(id: number): Promise<void> {
  return apiRequest<void>(`/api/repertorio/${id}`, 'DELETE')
}
