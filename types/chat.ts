// Chat nội bộ (nhắn tin chữ 1-1) — kiểu dữ liệu khớp services/chat_service.go của API.
import type { Role } from '~/types'

export interface ChatUser {
  id: number
  full_name: string
  email?: string
  role: Role
  seller_name?: string
}

export interface ChatMessage {
  id: number
  conversation_id: number
  sender_id: number
  body: string
  created_at: string
  client_id?: string
  /** Chỉ phía web: tin đang gửi (id âm tạm) hoặc gửi lỗi. */
  pending?: 'sending' | 'failed'
}

export interface ChatConversation {
  id: number
  /** Người bên kia của cuộc 1-1. */
  peer: ChatUser
  last_message?: ChatMessage | null
  last_message_at: string
  unread: number
  my_last_read: number
}

export interface ChatMessagePage {
  messages: ChatMessage[]
  has_more: boolean
}
