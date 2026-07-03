import { apiGet, apiPost } from '../http'
import type { LoginResponse, User } from '~/types'

export const authApi = {
  login: (email: string, password: string) =>
    apiPost<LoginResponse>('/api/auth/login', { email, password }),
  me: () => apiGet<User>('/api/me'),
}
