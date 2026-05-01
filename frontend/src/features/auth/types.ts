export type User = {
  id: number
  name: string
  email: string
  phone: string
}

export type RegisterPayload = {
  name: string
  email: string
  phone: string
  password: string
}

export type LoginPayload = {
  email: string
  password: string
}
