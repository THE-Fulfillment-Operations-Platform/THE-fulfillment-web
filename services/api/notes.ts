import { apiGet, apiPost, apiPut, apiDelete } from '../http'
import type {
  Note,
  NoteSeverity,
  NoteStatus,
  EntityType,
  Role,
  ListParams,
  NoteDeleteResult,
} from '~/types'

export interface NoteListParams extends ListParams {
  status?: string
  severity?: string
  entity_type?: string
  entity_id?: number
  required_attention?: boolean
}

export interface NoteInput {
  title: string
  body?: string
  reason_code?: string
  severity: NoteSeverity
  status: NoteStatus
  is_required_attention: boolean
  entity_type?: EntityType
  entity_id?: number
  owner_role?: Role
  due_date?: string
}

export const notesApi = {
  list: (params?: NoteListParams) => apiGet<Note[]>('/api/notes', params),
  get: (id: number | string) => apiGet<Note>(`/api/notes/${id}`),
  create: (body: NoteInput) => apiPost<Note>('/api/notes', body),
  update: (id: number | string, body: Partial<NoteInput>) => apiPut<Note>(`/api/notes/${id}`, body),
  remove: (id: number | string) => apiDelete<unknown>(`/api/notes/${id}`),
  // Xoá nhiều note trong MỘT request — màn này phần lớn là cảnh báo tự sinh nên
  // dọn theo lô là thao tác thường xuyên nhất.
  bulkRemove: (ids: number[]) => apiPost<NoteDeleteResult>('/api/notes/bulk-delete', { ids }),
  // "Chọn tất cả": gửi BỘ LỌC đang xem thay vì danh sách id, để server xoá đúng
  // toàn bộ tập khớp — kể cả các trang chưa tải. Gửi id thì chỉ xoá được đúng
  // những gì client đang giữ (một trang), tức là im lặng làm thiếu việc.
  bulkRemoveMatching: (filter: NoteListParams) =>
    apiPost<NoteDeleteResult>('/api/notes/bulk-delete', { ...filter, all: true }),
}
