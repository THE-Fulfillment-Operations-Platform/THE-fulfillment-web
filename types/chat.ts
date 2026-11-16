// Chat nội bộ — kiểu dữ liệu khớp internal/services/chat_*.go của API.
import type { Role } from '~/types'

export interface ChatUser {
  id: number
  full_name: string
  email?: string
  role: Role
  seller_name?: string
}

export interface ChatMember extends ChatUser {
  last_read_message_id: number
  last_read_at?: string | null
}

export interface ChatAttachment {
  id: number
  name: string
  mime: string
  size: number
  is_image: boolean
  width?: number
  height?: number
  /** URL ký có hạn (đường dẫn /api/...). Dùng qua chatAssetUrl(). */
  url: string
  thumb_url?: string
  download_url: string
}

export interface ChatReaction {
  emoji: string
  user_ids: number[]
}

/** Mã đơn / mã batch có thật trong tin (API dò lúc gửi). */
export interface ChatRef {
  code: string
  kind: 'order' | 'batch'
  id: number
}

export interface ChatReply {
  id: number
  sender_id: number
  sender_name: string
  body: string
  recalled: boolean
  attachment?: string
  is_image?: boolean
}

export interface ChatMessage {
  id: number
  conversation_id: number
  sender_id: number
  sender_name?: string
  kind?: 'text' | 'system'
  body: string
  created_at: string
  client_id?: string
  edited_at?: string | null
  recalled_at?: string | null
  reply_to?: ChatReply | null
  attachments?: ChatAttachment[]
  reactions?: ChatReaction[]
  refs?: ChatRef[]
  /** Chỉ phía web: tin đang gửi (id âm tạm) hoặc gửi lỗi. */
  pending?: 'sending' | 'failed'
  /** Chỉ phía web: file đang chờ tải lên của tin tạm (để thử lại). */
  localFiles?: File[]
  /** Chỉ phía web: ảnh xem trước của file đang tải (object URL). */
  localPreviews?: { name: string; url: string | null; size: number }[]
  /** Chỉ phía web: id file đã tải lên xong (thử lại không tải lại). */
  uploadedIds?: number[]
  /** Chỉ phía web: lý do gửi lỗi. */
  error?: string
}

export interface ChatConversation {
  id: number
  kind: 'direct' | 'group'
  title: string
  /** Người bên kia của cuộc 1-1 (không có ở nhóm). */
  peer?: ChatUser | null
  members: ChatMember[]
  created_by_id: number
  can_manage: boolean
  pinned_at?: string | null
  last_message?: ChatMessage | null
  last_message_at: string
  unread: number
  my_last_read: number
}

export interface ChatMessagePage {
  messages: ChatMessage[]
  has_more: boolean
}

export interface ChatConfig {
  enabled: boolean
  files: boolean
  file_max_bytes: number
  reactions: string[]
  edit_minutes: number
}

export interface ChatPresence {
  online: number[]
  last_seen: Record<string, string>
}
