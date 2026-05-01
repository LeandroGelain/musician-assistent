import { apiRequest } from '../../app/api'

export type MetronomoSettings = {
  bpm: number
  beatsPerBar: number
}

export function getMetronomoSettings(): Promise<MetronomoSettings> {
  return apiRequest<MetronomoSettings>('/api/metronomo/settings')
}

export function saveMetronomoSettings(
  payload: MetronomoSettings,
): Promise<MetronomoSettings> {
  return apiRequest<MetronomoSettings>('/api/metronomo/settings', 'PUT', payload)
}
