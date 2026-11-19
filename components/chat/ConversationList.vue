<script setup lang="ts">
import { useChatStore } from '~/stores/chat'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import type { ChatConversation } from '~/types/chat'
import { convTitle, listTime, messagePreview } from '~/utils/chat'

// Danh sách cuộc trò chuyện (dùng ở cả trang đầy đủ lẫn ô chat nhỏ). Cuộc đã
// ghim đứng trên cùng (store sắp); rê chuột vào một cuộc hiện nút ghim.
defineProps<{ activeId: number | null }>()
const emit = defineEmits<{ (e: 'open', id: number): void }>()
const chat = useChatStore()
const toast = useToastStore()

function preview(c: ChatConversation): string {
  const typing = chat.typingNames(c.id)
  if (typing.length) return c.kind === 'group' ? `${typing[0].split(' ').slice(-1)[0]} đang soạn…` : 'Đang soạn…'
  return messagePreview(c.last_message, chat.me, c.kind === 'group')
}
function peerOnline(c: ChatConversation): boolean {
  return c.kind !== 'group' && !!c.peer && !!chat.online[c.peer.id]
}
async function pin(c: ChatConversation) {
  try {
    await chat.togglePin(c.id)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
    <p v-if="!chat.listLoaded" class="p-6 text-center text-[15px] text-muted-foreground">Đang tải…</p>
    <p v-else-if="!chat.conversations.length" class="p-6 text-center text-[15px] text-muted-foreground">
      Chưa có cuộc trò chuyện nào. Bấm <UiIcon name="plus" :size="14" class="inline" /> để nhắn tin hoặc tạo nhóm.
    </p>
    <div
      v-for="c in chat.conversations"
      :key="c.id"
      class="group relative flex w-full items-center rounded-xl transition-colors"
      :class="activeId === c.id ? 'bg-accent' : 'hover:bg-muted'"
    >
      <!-- Kiểu Messenger: avatar 48, tên 15px, tin cuối 1 dòng 14px + giờ 12px;
           chưa đọc thì tên + tin cuối in đậm và có chấm số đếm màu chủ đạo. -->
      <button
        type="button"
        class="chat-focus flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left"
        :aria-current="activeId === c.id ? 'true' : undefined"
        :data-chat-conv="c.kind === 'group' ? `group:${c.title}` : c.peer?.email || c.peer?.full_name"
        @click="emit('open', c.id)"
      >
        <ChatAvatar :id="c.peer?.id || c.id" :name="convTitle(c)" :size="48" :group="c.kind === 'group'" :online="peerOnline(c)" />
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1">
            <span class="truncate text-[15px] leading-5 text-foreground" :class="c.unread ? 'font-bold' : 'font-semibold'">{{ convTitle(c) }}</span>
            <UiIcon v-if="c.pinned_at" name="pin" :size="13" class="shrink-0 text-muted-foreground" data-chat-pinned />
          </span>
          <span class="mt-0.5 flex items-baseline gap-1" :class="c.unread ? 'font-semibold text-foreground' : 'text-muted-foreground'">
            <span class="min-w-0 truncate text-sm" :class="chat.typingNames(c.id).length ? 'font-normal italic text-primary' : ''">{{ preview(c) }}</span>
            <span class="shrink-0 text-xs" :class="c.unread ? 'text-primary' : ''">· {{ listTime(c.last_message_at) }}</span>
          </span>
        </span>
        <span
          v-if="c.unread"
          class="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold leading-none text-primary-foreground"
          :title="`${c.unread} tin chưa đọc`"
          :aria-label="`${c.unread} tin chưa đọc`"
          :data-chat-unread="c.unread"
        >
          {{ c.unread > 99 ? '99+' : c.unread }}
        </span>
      </button>
      <button
        type="button"
        class="chat-focus mr-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground group-focus-within:inline-flex group-hover:inline-flex"
        :class="c.pinned_at ? '!inline-flex text-primary' : ''"
        :title="c.pinned_at ? 'Bỏ ghim' : 'Ghim lên đầu'"
        :aria-label="c.pinned_at ? 'Bỏ ghim' : 'Ghim lên đầu'"
        data-chat-pin
        @click.stop="pin(c)"
      >
        <UiIcon name="pin" :size="15" />
      </button>
    </div>
  </div>
</template>
