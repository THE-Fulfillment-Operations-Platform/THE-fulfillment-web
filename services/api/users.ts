import { apiGet, apiPost, apiPut, apiDelete } from '../http'
import type { User, Role, AuditLog, PermissionCatalog } from '~/types'

export interface UserInput {
  email: string
  password: string
  full_name: string
  role: Role
  seller_id?: number
  is_active?: boolean
  /** Quyền tick riêng; null = theo mặc định của vai trò. Bỏ trống = không đổi. */
  permissions?: string[] | null
  /**
   * Xác nhận dùng lại một tài khoản ĐÃ XOÁ đang giữ email này. Thiếu cờ thì
   * backend từ chối với code USER_DELETED_EMAIL kèm tên tài khoản cũ, để người
   * dùng biết mình sắp nhận lại lịch sử công việc của ai trước khi đồng ý.
   */
  restore_deleted?: boolean
}

/** Code backend trả khi email trùng một tài khoản đã xoá (cần xác nhận khôi phục). */
export const ERR_USER_DELETED_EMAIL = 'USER_DELETED_EMAIL'

export const usersApi = {
  list: (params?: { page?: number; page_size?: number }) => apiGet<User[]>('/api/users', params),
  get: (id: number | string) => apiGet<User>(`/api/users/${id}`),
  create: (body: UserInput) => apiPost<User>('/api/users', body),
  update: (id: number | string, body: Partial<UserInput>) => apiPut<User>(`/api/users/${id}`, body),
  remove: (id: number | string) => apiDelete<unknown>(`/api/users/${id}`),
  // Các màn tick được + bộ tick mặc định của từng vai trò, cho form người dùng.
  permissionCatalog: () => apiGet<PermissionCatalog>('/api/permission-catalog'),
}

export const auditApi = {
  // Audit logs grow fastest of all tables — always page server-side instead of
  // pulling the whole trail into the browser.
  list: (params?: { page?: number; page_size?: number }) => apiGet<AuditLog[]>('/api/audit-logs', params),
}
