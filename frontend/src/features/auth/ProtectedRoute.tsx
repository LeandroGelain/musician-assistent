import { Navigate } from 'react-router-dom'
import type { PropsWithChildren } from 'react'
import { useAuth } from './AuthContext'

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <div className="p-8">Carregando...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}
