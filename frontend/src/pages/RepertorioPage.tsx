import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createRepertorioItem,
  deleteRepertorioItem,
  listRepertorio,
  type RepertorioItem,
} from '../features/repertorio/repertorioController'

export function RepertorioPage() {
  const [items, setItems] = useState<RepertorioItem[]>([])
  const [form, setForm] = useState({ title: '', artist: '', notes: '' })
  const [status, setStatus] = useState('')

  async function loadItems() {
    try {
      const result = await listRepertorio()
      setItems(result)
    } catch {
      setStatus('Falha ao carregar repertorio')
    }
  }

  useEffect(() => {
    void loadItems()
  }, [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('')

    try {
      await createRepertorioItem(form)
      setForm({ title: '', artist: '', notes: '' })
      await loadItems()
      setStatus('Musica adicionada')
    } catch {
      setStatus('Nao foi possivel adicionar musica')
    }
  }

  async function onDelete(id: number) {
    try {
      await deleteRepertorioItem(id)
      await loadItems()
    } catch {
      setStatus('Erro ao remover item')
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8">
      <section className="card p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl">Repertorio</h1>
          <Link className="text-sm font-semibold text-blue-700" to="/">
            Voltar
          </Link>
        </div>

        <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Titulo"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            required
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Artista"
            value={form.artist}
            onChange={(event) => setForm({ ...form, artist: event.target.value })}
            required
          />
          <textarea
            className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-2"
            placeholder="Observacoes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            rows={3}
          />
          <button className="btn-primary rounded-lg px-4 py-2 font-semibold md:col-span-2" type="submit">
            Adicionar
          </button>
        </form>

        {status && <p className="mt-4 text-sm text-slate-600">{status}</p>}

        <ul className="mt-6 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              <div>
                <h2 className="text-lg">{item.title}</h2>
                <p className="text-sm text-slate-600">{item.artist}</p>
                {item.notes && <p className="mt-1 text-sm">{item.notes}</p>}
              </div>
              <button
                className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-700"
                onClick={() => onDelete(item.id)}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
