import { apiGet, apiPost } from '../http'
import type { ChatConversation, ChatMessage, ChatMessagePage, ChatUser } from '~/types/chat'

// Chat nội bộ. Mọi endpoint trả 403 cho tài khoản chưa được mở chat (CHAT_ROLES).
export const chatApi = {
  config: () => apiGet<{ enabled: boolean }>('/api/chat/config'),
  ticket: () => apiPost<{ ticket: string; expires_in: number }>('/api/chat/ws-ticket'),
  users: (q?: string) => apiGet<ChatUser[]>('/api/chat/users', { q }),
  conversations: () => apiGet<ChatConversation[]>('/api/chat/conversations'),
  conversation: (id: number) => apiGet<ChatConversation>(`/api/chat/conversations/${id}`),
  /** Mở (hoặc tạo) cuộc 1-1 với một người. */
  open: (userId: number) => apiPost<ChatConversation>('/api/chat/conversations', { user_id: userId }),
  markRead: (id: number, messageId: number) =>
    apiPost<unknown>(`/api/chat/conversations/${id}/read`, { message_id: messageId }),
  messages: (id: number, params: { before_id?: number; after_id?: number; limit?: number }) =>
    apiGet<ChatMessagePage>(`/api/chat/conversations/${id}/messages`, params),
  send: (id: number, body: string, clientId: string) =>
    apiPost<ChatMessage>(`/api/chat/conversations/${id}/messages`, { body, client_id: clientId }),
}

// Gốc URL của API, do plugins/chat.client.ts đặt một lần lúc khởi động (gọi
// useRuntimeConfig trong callback ngoài setup thì lỗi "Nuxt instance unavailable").
let apiBase = ''
export function setChatApiBase(base: string) {
  apiBase = String(base ?? '').replace(/\/+$/, '')
}

/** URL WebSocket: theo apiBase khi chạy dev khác cổng, cùng nguồn trên production. */
export function chatSocketUrl(ticket: string): string {
  const path = `/api/chat/ws?ticket=${encodeURIComponent(ticket)}`
  if (apiBase) return apiBase.replace(/^http/, 'ws') + path
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}
