import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './features/auth/ProtectedRoute'
import { AfinadorPage } from './pages/AfinadorPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MetronomoPage } from './pages/MetronomoPage'
import { PartituraViewerPage } from './pages/PartituraViewerPage'
import { PartituraViewerV2Page } from './pages/PartituraViewerV2Page'
import { PartiturasPage } from './pages/PartiturasPage'
import { RegisterPage } from './pages/RegisterPage'
import { RepertorioPage } from './pages/RepertorioPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cadastro" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/metronomo"
        element={
          <ProtectedRoute>
            <MetronomoPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/afinador"
        element={
          <ProtectedRoute>
            <AfinadorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/repertorio"
        element={
          <ProtectedRoute>
            <RepertorioPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/partituras"
        element={
          <ProtectedRoute>
            <PartiturasPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/partituras/:id"
        element={
          <ProtectedRoute>
            <PartituraViewerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/partituras/:id/v2"
        element={
          <ProtectedRoute>
            <PartituraViewerV2Page />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
