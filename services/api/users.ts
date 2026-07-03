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
  list: () => apiGet<User[]>('/api/users'),
  get: (id: number | string) => apiGet<User>(`/api/users/${id}`),
  create: (body: UserInput) => apiPost<User>('/api/users', body),
  update: (id: number | string, body: Partial<UserInput>) => apiPut<User>(`/api/users/${id}`, body),
  remove: (id: number | string) => apiDelete<unknown>(`/api/users/${id}`),
}

export const auditApi = {
  list: () => apiGet<AuditLog[]>('/api/audit-logs'),
}
