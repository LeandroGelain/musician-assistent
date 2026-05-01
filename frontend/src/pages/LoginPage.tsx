import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      await login(form)
      navigate('/')
    } catch {
      setError('Email ou senha invalidos')
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <section className="card w-full p-8">
        <h1 className="mb-2 text-3xl">Login</h1>
        <p className="mb-6 text-sm text-slate-600">Acesse sua conta para continuar.</p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            type="password"
            placeholder="Senha"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full rounded-lg px-4 py-2 font-semibold" type="submit">
            Entrar
          </button>
        </form>
        <p className="mt-6 text-sm">
          Nao tem conta?{' '}
          <Link className="font-semibold text-blue-700" to="/cadastro">
            Criar cadastro
          </Link>
        </p>
      </section>
    </main>
  )
}
