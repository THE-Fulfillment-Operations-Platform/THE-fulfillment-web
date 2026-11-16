<script setup lang="ts">
import { useChatStore } from '~/stores/chat'
import type { ChatConversation } from '~/types/chat'
import { listTime } from '~/utils/chat'

// Danh sách cuộc trò chuyện (dùng ở cả trang đầy đủ lẫn ô chat nhỏ).
defineProps<{ activeId: number | null }>()
const emit = defineEmits<{ (e: 'open', id: number): void }>()
const chat = useChatStore()

function preview(c: ChatConversation): string {
  const m = c.last_message
  if (!m) return 'Bắt đầu trò chuyện'
  const text = m.body.replace(/\s+/g, ' ')
  return m.sender_id === chat.me ? `Bạn: ${text}` : text
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
    <p v-if="!chat.listLoaded" class="p-6 text-center text-sm text-muted-foreground">Đang tải…</p>
    <p v-else-if="!chat.conversations.length" class="p-6 text-center text-sm text-muted-foreground">
      Chưa có cuộc trò chuyện nào. Bấm <UiIcon name="plus" :size="14" class="inline" /> để nhắn tin.
    </p>
    <button
      v-for="c in chat.conversations"
      :key="c.id"
      type="button"
      class="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors"
      :class="activeId === c.id ? 'bg-accent' : 'hover:bg-muted'"
      :data-chat-conv="c.peer.email || c.peer.full_name"
      @click="emit('open', c.id)"
    >
      <ChatAvatar :id="c.peer.id" :name="c.peer.full_name" :size="44" />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm text-foreground" :class="c.unread ? 'font-bold' : 'font-medium'">
          {{ c.peer.full_name }}
        </span>
        <span class="flex items-center gap-1 text-xs" :class="c.unread ? 'font-semibold text-foreground' : 'text-muted-foreground'">
          <span class="min-w-0 truncate">{{ preview(c) }}</span>
          <span class="shrink-0">· {{ listTime(c.last_message_at) }}</span>
        </span>
      </span>
      <span
        v-if="c.unread"
        class="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
        :data-chat-unread="c.unread"
      >
        {{ c.unread > 99 ? '99+' : c.unread }}
      </span>
    </button>
  </div>
</template>
