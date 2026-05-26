import { apiRequest } from '../../app/api'

export type PartituraEvent = {
  id: number
  order_index: number
  event_type: string
  note_name: string
  octave: number
  frequency_hz: number | null
  duration_label: string
  duration_beats: number
  duration_ms: number
  measure_number: number
  beat_start: number
  voice: number
  chord_group: number
}

export type PartituraMeasureMark = {
  id: number
  measure_number: number
  clef_sign: string
  clef_line: number
  time_signature: string
  key_fifths: number
  clef_octave_change: number
}

export type PartituraSummary = {
  id: number
  title: string
  source_filename: string
  parse_status: string
  parse_error: string
  tempo_bpm: number
  time_signature: string
  created_at: string
}

export type PartituraDetail = PartituraSummary & {
  events: PartituraEvent[]
  measure_marks: PartituraMeasureMark[]
}

export async function listPartituras(): Promise<PartituraSummary[]> {
  return apiRequest<PartituraSummary[]>('/api/partituras')
}

export async function importPartitura(payload: {
  title: string
  tempo_bpm: number
  time_signature?: string
  pdf_file: File
}): Promise<PartituraSummary> {
  const formData = new FormData()
  formData.append('title', payload.title)
  formData.append('tempo_bpm', String(payload.tempo_bpm))
  formData.append('time_signature', payload.time_signature ?? '')
  formData.append('pdf_file', payload.pdf_file)

  return apiRequest<PartituraSummary>('/api/partituras/import', 'POST', formData)
}

export async function getPartitura(id: number): Promise<PartituraDetail> {
  return apiRequest<PartituraDetail>(`/api/partituras/${id}`)
}

export async function deletePartitura(id: number): Promise<void> {
  return apiRequest<void>(`/api/partituras/${id}`, 'DELETE')
}

export async function exportPartitura(id: number): Promise<string> {
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/api/partituras/${id}/export`, {
    method: 'GET',
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error('Falha ao exportar partitura')
  }

  return response.text()
}

export async function getPartituraSourceFile(id: number): Promise<Blob> {
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/api/partituras/${id}/source`, {
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
    throw new Error(`Falha ao carregar arquivo fonte da partitura (${response.status})${backendDetail}`)
  }

  return response.blob()
}
