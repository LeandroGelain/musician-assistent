import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { loginUser, logoutUser, me, registerUser } from './authController'
import type { LoginPayload, RegisterPayload, User } from './types'

type AuthContextType = {
  user: User | null
  isLoading: boolean
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function bootstrapSession() {
      try {
        const currentUser = await me()
        setUser(currentUser)
      } catch {
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    void bootstrapSession()
  }, [])

  async function login(payload: LoginPayload) {
    const loggedUser = await loginUser(payload)
    setUser(loggedUser)
  }

  async function register(payload: RegisterPayload) {
    const createdUser = await registerUser(payload)
    setUser(createdUser)
  }

  async function logout() {
    await logoutUser()
    setUser(null)
  }

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout }),
    [user, isLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }

  return context
}
