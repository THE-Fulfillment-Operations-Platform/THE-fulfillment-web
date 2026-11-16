import { apiDelete, apiGet, apiPatch, apiPost } from '../http'
import type {
  ChatAttachment,
  ChatConfig,
  ChatConversation,
  ChatMessage,
  ChatMessagePage,
  ChatPresence,
  ChatReaction,
  ChatUser,
} from '~/types/chat'

// Chat nội bộ. Mọi endpoint trả 403 cho tài khoản chưa được mở chat (CHAT_ROLES,
// seller tắt hẳn).
export interface SendBody {
  body: string
  client_id: string
  reply_to_id?: number
  attachment_ids?: number[]
}

export const chatApi = {
  config: () => apiGet<ChatConfig>('/api/chat/config'),
  ticket: () => apiPost<{ ticket: string; expires_in: number }>('/api/chat/ws-ticket'),
  users: (q?: string) => apiGet<ChatUser[]>('/api/chat/users', { q }),
  presence: () => apiGet<ChatPresence>('/api/chat/presence'),
  search: (q: string, conversationId?: number) =>
    apiGet<ChatMessage[]>('/api/chat/search', { q, conversation_id: conversationId }),
  conversations: () => apiGet<ChatConversation[]>('/api/chat/conversations'),
  conversation: (id: number) => apiGet<ChatConversation>(`/api/chat/conversations/${id}`),
  /** Mở (hoặc tạo) cuộc 1-1 với một người. */
  open: (userId: number) => apiPost<ChatConversation>('/api/chat/conversations', { user_id: userId }),
  createGroup: (title: string, userIds: number[]) =>
    apiPost<ChatConversation>('/api/chat/groups', { title, user_ids: userIds }),
  rename: (id: number, title: string) => apiPatch<ChatConversation>(`/api/chat/conversations/${id}`, { title }),
  addMembers: (id: number, userIds: number[]) =>
    apiPost<ChatConversation>(`/api/chat/conversations/${id}/members`, { user_ids: userIds }),
  /** userId = chính mình là rời nhóm. */
  removeMember: (id: number, userId: number) => apiDelete<unknown>(`/api/chat/conversations/${id}/members/${userId}`),
  pin: (id: number, pinned: boolean) =>
    apiPost<{ pinned_at: string | null }>(`/api/chat/conversations/${id}/pin`, { pinned }),
  markRead: (id: number, messageId: number) =>
    apiPost<unknown>(`/api/chat/conversations/${id}/read`, { message_id: messageId }),
  messages: (id: number, params: { before_id?: number; after_id?: number; limit?: number }) =>
    apiGet<ChatMessagePage>(`/api/chat/conversations/${id}/messages`, params),
  send: (id: number, body: SendBody) => apiPost<ChatMessage>(`/api/chat/conversations/${id}/messages`, body),
  upload: (id: number, file: File) => {
    const fd = new FormData()
    fd.append('file', file, file.name)
    return apiPost<ChatAttachment>(`/api/chat/conversations/${id}/files`, fd)
  },
  edit: (messageId: number, body: string) => apiPatch<ChatMessage>(`/api/chat/messages/${messageId}`, { body }),
  recall: (messageId: number) => apiDelete<ChatMessage>(`/api/chat/messages/${messageId}`),
  react: (messageId: number, emoji: string) =>
    apiPost<{ reactions: ChatReaction[] }>(`/api/chat/messages/${messageId}/reactions`, { emoji }),
}

// Gốc URL của API, do plugins/chat.client.ts đặt một lần lúc khởi động (gọi
// useRuntimeConfig trong callback ngoài setup thì lỗi "Nuxt instance unavailable").
let apiBase = ''
export function setChatApiBase(base: string) {
  apiBase = String(base ?? '').replace(/\/+$/, '')
}

/** URL đầy đủ cho đường dẫn API (file chat): cùng nguồn trên production, khác cổng khi dev. */
export function chatAssetUrl(path: string | undefined | null): string {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return apiBase + path
}

/** URL WebSocket: theo apiBase khi chạy dev khác cổng, cùng nguồn trên production. */
export function chatSocketUrl(ticket: string): string {
  const path = `/api/chat/ws?ticket=${encodeURIComponent(ticket)}`
  if (apiBase) return apiBase.replace(/^http/, 'ws') + path
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}
