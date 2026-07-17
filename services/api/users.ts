import { apiGet, apiPost, apiPut, apiDelete } from '../http'
import type { User, Role, AuditLog } from '~/types'

export interface UserInput {
  email: string
  password: string
  full_name: string
  role: Role
  seller_id?: number
  is_active?: boolean
}

export const usersApi = {
  list: (params?: { page?: number; page_size?: number }) => apiGet<User[]>('/api/users', params),
  get: (id: number | string) => apiGet<User>(`/api/users/${id}`),
  create: (body: UserInput) => apiPost<User>('/api/users', body),
  update: (id: number | string, body: Partial<UserInput>) => apiPut<User>(`/api/users/${id}`, body),
  remove: (id: number | string) => apiDelete<unknown>(`/api/users/${id}`),
}

export const auditApi = {
  // Audit logs grow fastest of all tables — always page server-side instead of
  // pulling the whole trail into the browser.
  list: (params?: { page?: number; page_size?: number }) => apiGet<AuditLog[]>('/api/audit-logs', params),
}
