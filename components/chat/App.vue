<script setup lang="ts">
import { chatApi } from '~/services/api/chat'
import { useChatStore } from '~/stores/chat'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import type { ChatUser } from '~/types/chat'

// Trang Tin nhắn đầy đủ, kiểu Messenger: cột trái danh sách cuộc, bên phải khung
// nhắn. Điện thoại: một cột — chạm vào cuộc thì mở khung nhắn, nút ← để quay lại.
// Cuộc đang mở nằm trên URL (?c=12) nên tải lại trang / nút "mở rộng" của ô chat
// nhỏ mở đúng cuộc.
const chat = useChatStore()
const route = useRoute()
const router = useRouter()
const toast = useToastStore()

const activeId = computed<number | null>(() => {
  const v = Number(route.query.c)
  return Number.isFinite(v) && v > 0 ? v : null
})
const active = computed(() => (activeId.value ? chat.byId(activeId.value) : undefined))
const picking = ref(false)

function open(id: number) {
  router.replace({ query: { c: String(id) } })
}

async function pick(u: ChatUser) {
  try {
    const { data } = await chatApi.open(u.id)
    chat.upsertConversation(data)
    picking.value = false
    open(data.id)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

// Cuộc trên URL chưa có trong danh sách (vừa được nhắn lần đầu): nạp riêng.
watch(
  () => [activeId.value, chat.listLoaded] as const,
  ([id, loaded]) => {
    if (id && loaded && !chat.byId(id)) void chat.refreshConversation(id)
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex h-full min-h-0 w-full overflow-hidden bg-card">
    <div v-if="!chat.enabled" class="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
      Chat chưa mở cho tài khoản này.
    </div>
    <template v-else>
      <aside
        class="h-full w-full flex-col border-r border-border md:flex md:w-80 lg:w-96"
        :class="activeId ? 'hidden' : 'flex'"
      >
        <div class="flex h-14 shrink-0 items-center gap-2 px-4">
          <h1 class="flex-1 text-lg font-semibold text-foreground">Tin nhắn</h1>
          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground hover:bg-accent"
            title="Nhắn tin mới"
            data-chat-new
            @click="picking = true"
          >
            <UiIcon name="plus" :size="18" />
          </button>
        </div>
        <ChatConversationList :active-id="activeId" @open="open" />
      </aside>

      <ChatThread v-if="active" :key="active.id" :conv-id="active.id" @back="router.replace({ query: {} })" />
      <div v-else class="hidden flex-1 items-center justify-center bg-background text-sm text-muted-foreground md:flex">
        <div class="text-center">
          <UiIcon name="chat" :size="40" class="mx-auto mb-2 opacity-40" />
          <p>Chọn một cuộc trò chuyện, hoặc bấm <UiIcon name="plus" :size="14" class="inline" /> để nhắn tin mới.</p>
        </div>
      </div>

      <UiModal v-model="picking" title="Nhắn tin mới">
        <div class="flex h-[60vh] flex-col">
          <ChatPeoplePicker v-if="picking" @pick="pick" />
        </div>
      </UiModal>
    </template>
  </div>
</template>
