import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteExercicio,
  generateExercicio,
  listExercicios,
  type ExercicioSummary,
} from '../app/exercicioController'

const SCALE_OPTIONS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const MEASURES_OPTIONS = [2, 4, 8, 16]

export function ExerciciosPage() {
  const [exercicios, setExercicios] = useState<ExercicioSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  const [scale, setScale] = useState('C')
  const [tempoBpm, setTempoBpm] = useState(80)
  const [numMeasures, setNumMeasures] = useState(4)

  const load = useCallback(async () => {
    try {
      setIsLoading(true)
      setError('')
      const items = await listExercicios()
      setExercicios(items)
    } catch {
      setError('Erro ao carregar exerc\u00edcios.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleGenerate() {
    setIsGenerating(true)
    setError('')
    try {
      await generateExercicio({ scale, tempo_bpm: tempoBpm, num_measures: numMeasures })
      await load()
    } catch {
      setError('Erro ao gerar exerc\u00edcio.')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteExercicio(id)
      setExercicios((prev) => prev.filter((e) => e.id !== id))
    } catch {
      setError('Erro ao remover exerc\u00edcio.')
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-heading, inherit)' }}>
          Exerc\u00edcios
        </h1>
        <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm" to="/">
          Voltar
        </Link>
      </div>

      {/* Generator panel */}
      <section className="card mb-6 p-5">
        <h2 className="mb-4 text-lg font-semibold">Gerar novo exerc\u00edcio</h2>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Escala
            <select
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={scale}
              onChange={(e) => setScale(e.target.value)}
            >
              {SCALE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s} maior</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            BPM
            <input
              type="number"
              min={40}
              max={200}
              className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={tempoBpm}
              onChange={(e) => setTempoBpm(Number(e.target.value))}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Compassos
            <select
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={numMeasures}
              onChange={(e) => setNumMeasures(Number(e.target.value))}
            >
              {MEASURES_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              className="btn-primary px-5 py-2 text-sm font-semibold disabled:opacity-60"
              onClick={handleGenerate}
              disabled={isGenerating}
              type="button"
            >
              {isGenerating ? 'Gerando...' : 'Gerar exerc\u00edcio'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* List */}
      <section className="card p-5">
        <h2 className="mb-4 text-lg font-semibold">Meus exerc\u00edcios</h2>

        {isLoading && <p className="text-sm text-slate-500">Carregando...</p>}

        {!isLoading && exercicios.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum exerc\u00edcio gerado ainda. Clique em "Gerar exerc\u00edcio" acima.</p>
        )}

        <ul className="divide-y divide-slate-100">
          {exercicios.map((ex) => (
            <li key={ex.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{ex.title}</p>
                <p className="text-xs text-slate-500">
                  {ex.time_signature} | {ex.num_measures} compassos | {ex.tempo_bpm} BPM |{' '}
                  {new Date(ex.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/exercicios/${ex.id}`}
                  className="rounded-md border border-emerald-400 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                >
                  Praticar
                </Link>
                <button
                  type="button"
                  onClick={() => void handleDelete(ex.id)}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600"
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
