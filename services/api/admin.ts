import { apiPost } from '../http'

export interface ResetResult {
  scope: string
  cleared: string[]
}

// Danger-zone maintenance. `resetData` wipes all order/production data so the
// catalog can be re-imported from scratch; master data and users are kept.
// OWNER-only + gated by ALLOW_DATA_RESET on the backend.
export const adminApi = {
  resetData: (scope: 'transactional' | 'all' = 'transactional') =>
    apiPost<ResetResult>('/api/admin/reset', { scope }),
}
