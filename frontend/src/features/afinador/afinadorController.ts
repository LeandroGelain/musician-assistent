import { apiRequest } from '../../app/api'

export type AfinadorSettings = {
  reference_frequency: number
  instrument: string
}

export function getAfinadorSettings(): Promise<AfinadorSettings> {
  return apiRequest<AfinadorSettings>('/api/afinador/settings')
}

export function saveAfinadorSettings(
  payload: AfinadorSettings,
): Promise<AfinadorSettings> {
  return apiRequest<AfinadorSettings>('/api/afinador/settings', 'PUT', payload)
}
