<script setup lang="ts">
import { chatApi } from '~/services/api/chat'
import { useAuthStore } from '~/stores/auth'
import { useChatStore } from '~/stores/chat'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import type { ChatConversation, ChatUser } from '~/types/chat'
import { convTitle, presenceLabel } from '~/utils/chat'

// Bong bóng chat nổi góc phải dưới (Nghĩa #5373): bấm vào thì nổi ô chat nhỏ kiểu
// Messenger — danh sách cuộc, mở cuộc ngay trong ô, nhắn mới / tạo nhóm, nút
// "mở rộng" sang trang Tin nhắn đầy đủ. Chỉ hiện với tài khoản được mở chat; ẩn
// trên chính trang Tin nhắn. Dùng chung store + WebSocket với trang đầy đủ.
const chat = useChatStore()
const auth = useAuthStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const chatPath = computed(() => (auth.isSeller ? '/seller/chat' : '/chat'))
const visible = computed(() => chat.enabled && route.path !== chatPath.value)
const open = ref(false)
const view = ref<'list' | 'thread' | 'new' | 'group'>('list')
const convId = ref<number | null>(null)
const root = ref<HTMLElement | null>(null)
const thread = ref<{ openInfo: () => void } | null>(null)
const conv = computed(() => (convId.value ? chat.byId(convId.value) : undefined))
/** Dòng dưới tên ở đầu ô: đang soạn / "Đang hoạt động" / số thành viên nhóm. */
const threadSubtitle = computed(() => {
  const c = conv.value
  if (!c) return ''
  if (chat.typingNames(c.id).length) return 'đang soạn tin…'
  if (c.kind === 'group') return `${c.members.length} thành viên`
  return c.peer ? presenceLabel(!!chat.online[c.peer.id], chat.lastSeen[c.peer.id], chat.tick) : ''
})

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
function created(c: ChatConversation) {
  openConv(c.id)
}

// Bấm ra ngoài ô (và ngoài bong bóng) hoặc Esc thì đóng. Hộp xác nhận, khung
// xem ảnh, hộp thông tin nhóm được đưa ra ngoài app (Teleport vào body) — bấm
// trong chúng không tính là "bấm ra ngoài".
function onPointerDown(e: PointerEvent) {
  if (!open.value) return
  const t = e.target as Node | null
  const app = document.getElementById('__nuxt')
  if (!t || !root.value || root.value.contains(t)) return
  if (app && !app.contains(t)) return
  close()
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !open.value) return
  if (document.querySelector('[data-chat-overlay], [role="alertdialog"]')) return
  close()
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
// Cuộc đang mở biến mất (rời nhóm / bị mời ra): về danh sách.
watch(conv, (c) => {
  if (!c && view.value === 'thread') backToList()
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
        class="fixed bottom-[5.25rem] right-3 z-30 flex h-[min(38rem,calc(100dvh-9.5rem))] w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft sm:right-5"
        role="dialog"
        aria-label="Tin nhắn"
        data-chat-popup
      >
        <div class="flex h-14 shrink-0 items-center gap-0.5 border-b border-border px-2">
          <button
            v-if="view !== 'list'"
            class="chat-icon-btn text-primary"
            aria-label="Quay lại danh sách"
            data-chat-back
            @click="backToList"
          >
            <UiIcon name="arrow-left" :size="20" />
          </button>
          <template v-if="view === 'thread' && conv">
            <ChatAvatar
              :id="conv.peer?.id || conv.id"
              :name="convTitle(conv)"
              :size="34"
              :group="conv.kind === 'group'"
              :online="conv.kind !== 'group' && !!conv.peer && !!chat.online[conv.peer.id]"
            />
            <div class="min-w-0 flex-1 pl-1.5">
              <p class="truncate text-[15px] font-semibold leading-tight text-foreground" data-chat-title>{{ convTitle(conv) }}</p>
              <p v-if="threadSubtitle" class="truncate text-xs" :class="chat.typingNames(conv.id).length ? 'italic text-primary' : 'text-muted-foreground'">
                {{ threadSubtitle }}
              </p>
            </div>
            <button
              v-if="conv.kind === 'group'"
              class="chat-icon-btn text-foreground"
              title="Thành viên, đổi tên, rời nhóm"
              aria-label="Thông tin nhóm"
              data-chat-group-info-open
              @click="thread?.openInfo()"
            >
              <UiIcon name="info" :size="18" />
            </button>
          </template>
          <p v-else class="min-w-0 flex-1 truncate pl-2 text-lg font-bold text-foreground">
            {{ view === 'new' ? 'Nhắn tin mới' : view === 'group' ? 'Tạo nhóm' : 'Tin nhắn' }}
          </p>
          <template v-if="view === 'list'">
            <button
              class="chat-icon-btn"
              :class="chat.muted ? 'text-muted-foreground' : 'text-foreground'"
              :title="chat.muted ? 'Đang tắt âm báo — bấm để bật' : 'Tắt âm báo tin mới'"
              :aria-label="chat.muted ? 'Bật âm báo tin mới' : 'Tắt âm báo tin mới'"
              data-chat-mute
              @click="chat.toggleMute()"
            >
              <UiIcon :name="chat.muted ? 'volume-off' : 'volume-on'" :size="18" />
            </button>
            <button
              class="chat-icon-btn text-foreground"
              title="Tạo nhóm"
              aria-label="Tạo nhóm"
              data-chat-new-group
              @click="view = 'group'"
            >
              <UiIcon name="users" :size="18" />
            </button>
            <button
              class="chat-icon-btn text-foreground"
              title="Nhắn tin mới"
              aria-label="Nhắn tin mới"
              data-chat-new
              @click="view = 'new'"
            >
              <UiIcon name="plus" :size="19" />
            </button>
          </template>
          <button
            class="chat-icon-btn text-foreground"
            title="Mở rộng — trang Tin nhắn đầy đủ"
            aria-label="Mở rộng thành trang Tin nhắn"
            data-chat-expand
            @click="expand"
          >
            <UiIcon name="expand" :size="18" />
          </button>
          <button
            class="chat-icon-btn text-foreground"
            title="Đóng"
            aria-label="Đóng ô chat"
            data-chat-close
            @click="close"
          >
            <UiIcon name="close" :size="19" />
          </button>
        </div>
        <ChatConversationList v-if="view === 'list'" :active-id="null" class="pt-1" @open="openConv" />
        <div v-else-if="view === 'new'" class="flex min-h-0 flex-1 flex-col p-3">
          <ChatPeoplePicker @pick="pick" />
        </div>
        <div v-else-if="view === 'group'" class="flex min-h-0 flex-1 flex-col p-3">
          <ChatGroupCreate @created="created" @cancel="backToList" />
        </div>
        <ChatThread v-else-if="convId" ref="thread" :key="convId" :conv-id="convId" :header="false" @back="backToList" />
      </div>
    </Transition>

    <!-- Bong bóng -->
    <button
      type="button"
      class="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:right-5"
      :title="open ? 'Thu ô chat' : 'Tin nhắn'"
      :aria-label="chat.totalUnread ? `Tin nhắn, ${chat.totalUnread} chưa đọc` : 'Tin nhắn'"
      :aria-expanded="open"
      data-chat-bubble
      @click="toggle"
    >
      <UiIcon :name="open ? 'close' : 'chat'" :size="26" />
      <span
        v-if="chat.totalUnread > 0"
        class="absolute -right-0.5 -top-0.5 inline-flex h-[1.4rem] min-w-[1.4rem] items-center justify-center rounded-full border-2 border-card bg-rose-600 px-1 text-xs font-bold leading-none text-white"
        data-chat-bubble-unread
      >
        {{ chat.totalUnread > 99 ? '99+' : chat.totalUnread }}
      </span>
    </button>
  </div>
</template>
