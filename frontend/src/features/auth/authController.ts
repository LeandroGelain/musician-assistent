import { apiRequest } from '../../app/api'
import type { LoginPayload, RegisterPayload, User } from './types'

export async function registerUser(payload: RegisterPayload): Promise<User> {
  return apiRequest<User>('/api/auth/register', 'POST', payload)
}

export async function loginUser(payload: LoginPayload): Promise<User> {
  return apiRequest<User>('/api/auth/login', 'POST', payload)
}

export async function me(): Promise<User> {
  return apiRequest<User>('/api/auth/me')
}

export async function logoutUser(): Promise<void> {
  return apiRequest<void>('/api/auth/logout', 'POST')
}
