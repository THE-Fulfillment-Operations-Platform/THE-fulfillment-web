<script setup lang="ts">
import { chatApi } from '~/services/api/chat'
import { useAuthStore } from '~/stores/auth'
import { useChatStore } from '~/stores/chat'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import type { ChatUser } from '~/types/chat'

// Bong bóng chat nổi góc phải dưới (Nghĩa #5373): bấm vào thì nổi ô chat nhỏ kiểu
// Messenger — danh sách cuộc, mở cuộc ngay trong ô, nút "mở rộng" sang trang Tin
// nhắn đầy đủ. Chỉ hiện với tài khoản được mở chat; ẩn trên chính trang Tin nhắn.
// Dùng chung store + WebSocket với trang đầy đủ (không mở kết nối thứ hai).
const chat = useChatStore()
const auth = useAuthStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const chatPath = computed(() => (auth.isSeller ? '/seller/chat' : '/chat'))
const visible = computed(() => chat.enabled && route.path !== chatPath.value)
const open = ref(false)
const view = ref<'list' | 'thread' | 'new'>('list')
const convId = ref<number | null>(null)
const root = ref<HTMLElement | null>(null)
const conv = computed(() => (convId.value ? chat.byId(convId.value) : undefined))

function toggle() {
  open.value = !open.value
}
function close() {
  open.value = false
}
function openConv(id: number) {
  convId.value = id
  view.value = 'thread'
}
function backToList() {
  view.value = 'list'
  convId.value = null
}
function expand() {
  const id = view.value === 'thread' ? convId.value : null
  close()
  router.push({ path: chatPath.value, query: id ? { c: String(id) } : {} })
}
async function pick(u: ChatUser) {
  try {
    const { data } = await chatApi.open(u.id)
    chat.upsertConversation(data)
    openConv(data.id)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

// Bấm ra ngoài ô (và ngoài bong bóng) hoặc Esc thì đóng. Hộp xác nhận / toast nằm
// ngoài ô nhưng không phải "bấm ra ngoài" theo nghĩa người dùng — chúng ở lớp
// z cao hơn và không bao giờ xuất hiện trong lúc ô chat đang mở.
function onPointerDown(e: PointerEvent) {
  if (!open.value) return
  const t = e.target as Node | null
  if (t && root.value && !root.value.contains(t)) close()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) close()
}
onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKey)
})
// Chuyển trang thì thu ô lại; đăng xuất / tắt chat thì về trạng thái đầu.
watch(() => route.path, close)
watch(visible, (v) => {
  if (!v) {
    close()
    backToList()
  }
})
</script>

<template>
  <div v-if="visible" ref="root" data-chat-widget>
    <!-- Ô chat nhỏ -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="open"
        class="fixed bottom-[5.25rem] right-3 z-30 flex h-[min(34rem,calc(100dvh-9.5rem))] w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft sm:right-5"
        role="dialog"
        aria-label="Tin nhắn"
        data-chat-popup
      >
        <div class="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
          <button
            v-if="view !== 'list'"
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted"
            aria-label="Quay lại danh sách"
            data-chat-back
            @click="backToList"
          >
            <UiIcon name="arrow-left" :size="18" />
          </button>
          <template v-if="view === 'thread' && conv">
            <ChatAvatar :id="conv.peer.id" :name="conv.peer.full_name" :size="28" />
            <p class="min-w-0 flex-1 truncate pl-1 text-sm font-semibold text-foreground" data-chat-title>{{ conv.peer.full_name }}</p>
          </template>
          <p v-else class="min-w-0 flex-1 truncate pl-2 text-sm font-semibold text-foreground">
            {{ view === 'new' ? 'Nhắn tin mới' : 'Tin nhắn' }}
          </p>
          <button
            v-if="view === 'list'"
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted"
            title="Nhắn tin mới"
            data-chat-new
            @click="view = 'new'"
          >
            <UiIcon name="plus" :size="18" />
          </button>
          <button
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted"
            title="Mở rộng — trang Tin nhắn đầy đủ"
            data-chat-expand
            @click="expand"
          >
            <UiIcon name="expand" :size="17" />
          </button>
          <button
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted"
            title="Đóng"
            data-chat-close
            @click="close"
          >
            <UiIcon name="close" :size="18" />
          </button>
        </div>
        <ChatConversationList v-if="view === 'list'" :active-id="null" class="pt-1" @open="openConv" />
        <div v-else-if="view === 'new'" class="flex min-h-0 flex-1 flex-col p-3">
          <ChatPeoplePicker @pick="pick" />
        </div>
        <ChatThread v-else-if="convId" :key="convId" :conv-id="convId" :header="false" />
      </div>
    </Transition>

    <!-- Bong bóng -->
    <button
      type="button"
      class="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring/40 sm:right-5"
      :title="open ? 'Thu ô chat' : 'Tin nhắn'"
      :aria-label="chat.totalUnread ? `Tin nhắn, ${chat.totalUnread} chưa đọc` : 'Tin nhắn'"
      :aria-expanded="open"
      data-chat-bubble
      @click="toggle"
    >
      <UiIcon :name="open ? 'close' : 'chat'" :size="26" />
      <span
        v-if="chat.totalUnread > 0"
        class="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.35rem] items-center justify-center rounded-full border-2 border-card bg-rose-500 px-1 py-0.5 text-[11px] font-bold leading-none text-white"
        data-chat-bubble-unread
      >
        {{ chat.totalUnread > 99 ? '99+' : chat.totalUnread }}
      </span>
    </button>
  </div>
</template>
