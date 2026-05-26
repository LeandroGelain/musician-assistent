import { apiRequest } from './api'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type ExercicioSummary = {
  id: number
  title: string
  scale: string
  tempo_bpm: number
  time_signature: string
  num_measures: number
  created_at: string
}

export type ExercicioGenerateParams = {
  scale?: string
  tempo_bpm?: number
  num_measures?: number
  time_signature?: string
}

export async function generateExercicio(params: ExercicioGenerateParams = {}): Promise<ExercicioSummary> {
  return apiRequest<ExercicioSummary>('/api/exercicios/generate', 'POST', {
    scale: params.scale ?? 'C',
    tempo_bpm: params.tempo_bpm ?? 80,
    num_measures: params.num_measures ?? 4,
    time_signature: params.time_signature ?? '4/4',
  })
}

export async function listExercicios(): Promise<ExercicioSummary[]> {
  return apiRequest<ExercicioSummary[]>('/api/exercicios')
}

export async function getExercicio(id: number): Promise<ExercicioSummary> {
  return apiRequest<ExercicioSummary>(`/api/exercicios/${id}`)
}

export async function deleteExercicio(id: number): Promise<void> {
  return apiRequest<void>(`/api/exercicios/${id}`, 'DELETE')
}

export async function getExercicioSourceFile(id: number): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/exercicios/${id}/source`, {
    method: 'GET',
    credentials: 'include',
  })

  if (!response.ok) {
    let backendDetail = ''
    try {
      const body = await response.json() as { detail?: string }
      backendDetail = body.detail ? `: ${body.detail}` : ''
    } catch {
      backendDetail = ''
    }
    throw new Error(`Falha ao carregar arquivo do exercicio (${response.status})${backendDetail}`)
  }

  return response.blob()
}
