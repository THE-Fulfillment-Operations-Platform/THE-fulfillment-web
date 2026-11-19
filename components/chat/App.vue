<script setup lang="ts">
import { chatApi } from '~/services/api/chat'
import { useChatStore } from '~/stores/chat'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import type { ChatConversation, ChatMessage, ChatUser } from '~/types/chat'
import { convTitle, listTime } from '~/utils/chat'

// Trang Tin nhắn đầy đủ, kiểu Messenger: cột trái danh sách cuộc (tìm tin, bật
// thông báo / âm báo, nhắn mới / tạo nhóm), bên phải khung nhắn. Điện thoại: một
// cột — chạm vào cuộc thì mở khung nhắn, nút ← để quay lại. Cuộc đang mở nằm
// trên URL (?c=12) nên tải lại trang / nút "mở rộng" của ô chat nhỏ mở đúng cuộc.
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
const mode = ref<'direct' | 'group'>('direct')

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
function created(c: ChatConversation) {
  picking.value = false
  open(c.id)
}
function newChat(m: 'direct' | 'group') {
  mode.value = m
  picking.value = true
}

// Cuộc trên URL chưa có trong danh sách (vừa được nhắn lần đầu): nạp riêng.
watch(
  () => [activeId.value, chat.listLoaded] as const,
  ([id, loaded]) => {
    if (id && loaded && !chat.byId(id)) void chat.refreshConversation(id)
  },
  { immediate: true },
)

// ---------------- tìm tin ----------------
const q = ref('')
const results = ref<ChatMessage[]>([])
const searching = ref(false)
const searchErr = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(q, (v) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchErr.value = ''
  if (v.trim().length < 2) {
    results.value = []
    searching.value = false
    return
  }
  searching.value = true
  searchTimer = setTimeout(async () => {
    try {
      results.value = (await chatApi.search(v.trim())).data || []
    } catch (e) {
      searchErr.value = errorMessage(e)
    } finally {
      searching.value = false
    }
  }, 300)
})
const searchingMode = computed(() => q.value.trim().length >= 2)
function openResult(m: ChatMessage) {
  q.value = ''
  // Khung nhắn của cuộc đó (mở mới hoặc đang mở) tự tải tới tin này rồi nháy sáng.
  chat.highlight = { convId: m.conversation_id, id: m.id }
  open(m.conversation_id)
}
function snippet(m: ChatMessage): string {
  const body = m.body.replace(/\s+/g, ' ')
  const i = body.toLowerCase().indexOf(q.value.trim().toLowerCase())
  if (i < 30) return body.slice(0, 120)
  return '…' + body.slice(i - 25, i + 95)
}

// ---------------- thông báo ----------------
async function toggleNotify() {
  const r = await chat.toggleNotify()
  if (r === 'denied') toast.error('Trình duyệt đang chặn thông báo của trang này — mở lại quyền trong biểu tượng ổ khoá cạnh địa chỉ web.')
  else if (r === 'unsupported') toast.error('Trình duyệt này không hỗ trợ thông báo.')
  else if (r === 'on') toast.success('Đã bật thông báo khi có tin mới (lúc bạn không xem tab này).')
}
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
        <div class="flex h-16 shrink-0 items-center gap-1 pl-4 pr-3">
          <h1 class="flex-1 text-xl font-bold text-foreground">Tin nhắn</h1>
          <button
            class="chat-icon-btn"
            :class="chat.notify ? 'text-primary' : 'text-muted-foreground'"
            :title="chat.notify ? 'Đang bật thông báo trình duyệt — bấm để tắt' : 'Bật thông báo trình duyệt khi có tin mới'"
            :aria-label="chat.notify ? 'Tắt thông báo trình duyệt' : 'Bật thông báo trình duyệt'"
            data-chat-notify
            @click="toggleNotify"
          >
            <UiIcon name="bell" :size="19" />
          </button>
          <button
            class="chat-icon-btn"
            :class="chat.muted ? 'text-muted-foreground' : 'text-primary'"
            :title="chat.muted ? 'Đang tắt âm báo — bấm để bật' : 'Tắt âm báo tin mới'"
            :aria-label="chat.muted ? 'Bật âm báo tin mới' : 'Tắt âm báo tin mới'"
            data-chat-mute
            @click="chat.toggleMute()"
          >
            <UiIcon :name="chat.muted ? 'volume-off' : 'volume-on'" :size="19" />
          </button>
          <button
            class="chat-icon-btn bg-muted text-foreground hover:bg-accent"
            title="Tạo nhóm"
            aria-label="Tạo nhóm"
            data-chat-new-group
            @click="newChat('group')"
          >
            <UiIcon name="users" :size="18" />
          </button>
          <button
            class="chat-icon-btn bg-muted text-foreground hover:bg-accent"
            title="Nhắn tin mới"
            aria-label="Nhắn tin mới"
            data-chat-new
            @click="newChat('direct')"
          >
            <UiIcon name="plus" :size="19" />
          </button>
        </div>
        <div class="shrink-0 px-3 pb-2">
          <div class="relative">
            <UiIcon name="search" :size="17" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              v-model="q"
              type="search"
              class="block w-full rounded-full border border-transparent bg-muted py-2 pl-10 pr-4 text-base text-foreground placeholder-muted-foreground transition-colors focus:border-ring/60 focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30 [@media(min-width:640px)_and_(pointer:fine)]:text-[15px]"
              placeholder="Tìm tin nhắn…"
              aria-label="Tìm tin nhắn"
              data-chat-search
            />
          </div>
        </div>
        <div v-if="searchingMode" class="min-h-0 flex-1 overflow-y-auto px-2 pb-2" data-chat-search-results>
          <p v-if="searching" class="p-4 text-center text-[15px] text-muted-foreground">Đang tìm…</p>
          <p v-else-if="searchErr" class="p-4 text-center text-[15px] text-destructive">{{ searchErr }}</p>
          <p v-else-if="!results.length" class="p-4 text-center text-[15px] text-muted-foreground">Không thấy tin nào có “{{ q.trim() }}”.</p>
          <button
            v-for="m in results"
            :key="m.id"
            type="button"
            class="chat-focus block w-full rounded-xl px-3 py-2.5 text-left hover:bg-muted"
            data-chat-search-hit
            @click="openResult(m)"
          >
            <span class="flex items-center gap-1 text-xs text-muted-foreground">
              <span class="truncate text-sm font-semibold text-foreground">{{ convTitle(chat.byId(m.conversation_id)) || 'Cuộc trò chuyện' }}</span>
              <span class="shrink-0">· {{ m.sender_id === chat.me ? 'Bạn' : m.sender_name }} · {{ listTime(m.created_at) }}</span>
            </span>
            <span class="mt-0.5 line-clamp-2 text-sm leading-snug text-foreground">{{ snippet(m) }}</span>
          </button>
        </div>
        <ChatConversationList v-else :active-id="activeId" @open="open" />
      </aside>

      <ChatThread v-if="active" :key="active.id" :conv-id="active.id" @back="router.replace({ query: {} })" />
      <div v-else class="hidden flex-1 items-center justify-center bg-background text-[15px] text-muted-foreground md:flex">
        <div class="text-center">
          <UiIcon name="chat" :size="44" class="mx-auto mb-2 opacity-40" />
          <p>Chọn một cuộc trò chuyện, hoặc bấm <UiIcon name="plus" :size="14" class="inline" /> để nhắn tin mới.</p>
        </div>
      </div>

      <UiModal v-model="picking" :title="mode === 'group' ? 'Tạo nhóm' : 'Nhắn tin mới'">
        <div class="flex h-[65vh] flex-col gap-2">
          <div class="flex shrink-0 gap-1 rounded-xl bg-muted p-1 text-sm">
            <button
              type="button"
              class="flex-1 rounded-lg py-1.5 font-medium"
              :class="mode === 'direct' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'"
              @click="mode = 'direct'"
            >
              Nhắn riêng
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg py-1.5 font-medium"
              :class="mode === 'group' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'"
              data-chat-mode-group
              @click="mode = 'group'"
            >
              Tạo nhóm
            </button>
          </div>
          <template v-if="picking">
            <ChatPeoplePicker v-if="mode === 'direct'" @pick="pick" />
            <ChatGroupCreate v-else @created="created" @cancel="picking = false" />
          </template>
        </div>
      </UiModal>
    </template>
  </div>
</template>
