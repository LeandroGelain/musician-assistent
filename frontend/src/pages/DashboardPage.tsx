import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

export function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8">
      <header className="card mb-6 flex items-center justify-between p-6">
        <div>
          <p className="text-sm text-slate-600">Bem-vindo</p>
          <h1 className="text-3xl">{user?.name}</h1>
        </div>
        <button className="rounded-lg border border-slate-300 px-4 py-2" onClick={handleLogout}>
          Sair
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <Link className="card p-6 transition hover:-translate-y-1" to="/metronomo">
          <h2 className="mb-2 text-2xl">Metronomo</h2>
          <p className="text-slate-600">Configure BPM e compasso para estudo diario.</p>
        </Link>
        <Link className="card p-6 transition hover:-translate-y-1" to="/afinador">
          <h2 className="mb-2 text-2xl">Afinador</h2>
          <p className="text-slate-600">Afine seu instrumento com deteccao de nota em tempo real.</p>
        </Link>
        <Link className="card p-6 transition hover:-translate-y-1" to="/partituras">
          <h2 className="mb-2 text-2xl">Partituras</h2>
          <p className="text-slate-600">Importe PDF, converta notas em frequencias e visualize em pauta.</p>
        </Link>
        <Link className="card p-6 transition hover:-translate-y-1" to="/exercicios">
          <h2 className="mb-2 text-2xl">Exercicios</h2>
          <p className="text-slate-600">Gere exercicios musicais aleatorios e pratique com o microfone.</p>
        </Link>
      </section>
    </main>
  )
}
