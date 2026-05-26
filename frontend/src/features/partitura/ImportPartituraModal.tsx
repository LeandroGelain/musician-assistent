import { useEffect, useState } from 'react'
import { importPartitura } from './partituraController'

type ImportPartituraModalProps = {
  open: boolean
  onClose: () => void
  onImported: () => Promise<void>
  onStatus: (message: string) => void
}

export function ImportPartituraModal({ open, onClose, onImported, onStatus }: ImportPartituraModalProps) {
  const [form, setForm] = useState({
    title: '',
    tempo_bpm: 120,
    time_signature: '',
    file: null as File | null,
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ title: '', tempo_bpm: 120, time_signature: '', file: null })
      setSubmitting(false)
    }
  }, [open])

  if (!open) {
    return null
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.file) {
      onStatus('Selecione um arquivo para importar')
      return
    }

    setSubmitting(true)
    onStatus('Importando e processando partitura...')

    try {
      await importPartitura({
        title: form.title,
        tempo_bpm: form.tempo_bpm,
        time_signature: form.time_signature.trim(),
        pdf_file: form.file,
      })
      await onImported()
      onStatus('Partitura importada com sucesso')
      onClose()
    } catch {
      onStatus('Falha ao importar partitura')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-slate-900">Importar partitura</h2>
          <button
            className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700"
            onClick={onClose}
            type="button"
            disabled={submitting}
          >
            Fechar
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          Use <strong>MusicXML (.xml ou .mxl)</strong> para melhor resultado. PDFs com MusicXML embutido também são suportados.
        </p>

        <form className="grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-2"
            placeholder="Titulo da partitura"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            required
            disabled={submitting}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            type="number"
            min={30}
            max={260}
            value={form.tempo_bpm}
            onChange={(event) => setForm({ ...form, tempo_bpm: Number(event.target.value) })}
            disabled={submitting}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={form.time_signature}
            onChange={(event) => setForm({ ...form, time_signature: event.target.value })}
            placeholder="Compasso (opcional, ex: 4/4)"
            disabled={submitting}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-3"
            type="file"
            accept=".xml,.mxl,application/pdf"
            onChange={(event) =>
              setForm({ ...form, file: event.target.files && event.target.files[0] ? event.target.files[0] : null })
            }
            disabled={submitting}
          />
          <button className="btn-primary rounded-lg px-4 py-2 font-semibold disabled:opacity-70" type="submit" disabled={submitting}>
            {submitting ? 'Importando...' : 'Importar'}
          </button>
        </form>
      </div>
    </div>
  )
}
