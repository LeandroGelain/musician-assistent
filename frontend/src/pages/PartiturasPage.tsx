import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deletePartitura,
  listPartituras,
  type PartituraSummary,
} from '../features/partitura/partituraController'
import { ImportPartituraModal } from '../features/partitura/ImportPartituraModal'

export function PartiturasPage() {
  const [items, setItems] = useState<PartituraSummary[]>([])
  const [status, setStatus] = useState('')
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  async function load() {
    try {
      const result = await listPartituras()
      setItems(result)
    } catch {
      setStatus('Falha ao carregar partituras')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onDelete(id: number) {
    try {
      await deletePartitura(id)
      await load()
    } catch {
      setStatus('Falha ao remover partitura')
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8">
      <section className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-3xl">Partituras</h1>
          <div className="flex items-center gap-2">
            <button className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold" onClick={() => setIsImportModalOpen(true)} type="button">
              Importar
            </button>
            <Link className="text-sm font-semibold text-blue-700" to="/">
              Voltar
            </Link>
          </div>
        </div>
        <p className="mb-5 text-sm text-slate-600">
          Importe partituras em <strong>MusicXML (.xml ou .mxl)</strong> exportado do MuseScore
          (Arquivo → Exportar → MusicXML) para extração precisa de notas e ritmo.
          PDFs com MusicXML embutido também são suportados.
        </p>

        {status && <p className="mt-4 text-sm text-slate-700">{status}</p>}

        <ul className="mt-6 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl">{item.title}</h2>
                  <p className="text-sm text-slate-600">
                    {item.source_filename} | {item.time_signature} | {item.tempo_bpm} BPM
                  </p>
                  <p className="mt-1 text-sm">
                    Status: <strong>{item.parse_status}</strong>
                    {item.parse_error ? ` - ${item.parse_error}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    className="rounded-md border border-indigo-300 px-3 py-2 text-sm text-indigo-700"
                    to={`/partituras/${item.id}/v2`}
                  >
                    Abrir partitura
                  </Link>
                  <button
                    className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700"
                    onClick={() => onDelete(item.id)}
                  >
                    Remover
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <ImportPartituraModal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImported={load}
        onStatus={setStatus}
      />
    </main>
  )
}
