<script setup lang="ts">
import { useChatStore } from '~/stores/chat'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import { ROLE_LABEL } from '~/utils/enums'
import type { ChatMessage } from '~/types/chat'
import { clockTime, dayLabel, sameDay } from '~/utils/chat'

// Khung nhắn của một cuộc: luồng tin + ô soạn. Dùng ở trang đầy đủ (có đầu khung)
// và trong ô chat nhỏ (ô chat tự vẽ đầu khung của nó: header=false).
const props = withDefaults(defineProps<{ convId: number; header?: boolean }>(), { header: true })
const emit = defineEmits<{ (e: 'back'): void }>()

const chat = useChatStore()
const toast = useToastStore()

const conv = computed(() => chat.byId(props.convId))
const messages = computed<ChatMessage[]>(() => chat.messages[props.convId] || [])
const scroller = ref<HTMLElement | null>(null)
const ta = ref<HTMLTextAreaElement | null>(null)
const text = ref('')
const loadingOlder = ref(false)
const atBottom = ref(true)
const newBelow = ref(0)

function isFirst(i: number) {
  const m = messages.value[i]
  const p = messages.value[i - 1]
  return !p || p.sender_id !== m.sender_id || !sameDay(p.created_at, m.created_at) ||
    Date.parse(m.created_at) - Date.parse(p.created_at) > 5 * 60_000
}
function isLast(i: number) {
  const m = messages.value[i]
  const n = messages.value[i + 1]
  return !n || n.sender_id !== m.sender_id || !sameDay(n.created_at, m.created_at) ||
    Date.parse(n.created_at) - Date.parse(m.created_at) > 5 * 60_000
}
function showDay(i: number) {
  const p = messages.value[i - 1]
  return !p || !sameDay(p.created_at, messages.value[i].created_at)
}

// ---------------- cuộn ----------------
function scrollToBottom(smooth = false) {
  const el = scroller.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  newBelow.value = 0
}

async function onScroll() {
  const el = scroller.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  if (atBottom.value) newBelow.value = 0
  if (el.scrollTop < 60 && !loadingOlder.value && chat.hasMore[props.convId]) {
    loadingOlder.value = true
    const before = el.scrollHeight
    try {
      if (await chat.loadOlder(props.convId)) {
        await nextTick()
        el.scrollTop += el.scrollHeight - before
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      loadingOlder.value = false
    }
  }
}

watch(
  () => messages.value.length,
  async (n, old) => {
    if (!old) return
    const last = messages.value[n - 1]
    await nextTick()
    if (atBottom.value || last?.sender_id === chat.me) scrollToBottom(true)
    else if (n > old) newBelow.value += n - old
  },
)

async function open() {
  newBelow.value = 0
  atBottom.value = true
  try {
    await chat.openConversation(props.convId)
  } catch (e) {
    toast.error(errorMessage(e))
  }
  await nextTick()
  scrollToBottom()
  ta.value?.focus()
}
watch(() => props.convId, open)
onMounted(open)
onBeforeUnmount(() => {
  if (chat.activeId === props.convId) chat.activeId = null
})

// ---------------- soạn & gửi ----------------
function autosize() {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 140)}px`
}

async function send() {
  const body = text.value.trim()
  if (!body) return
  text.value = ''
  nextTick(autosize)
  try {
    await chat.send(props.convId, body)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

function onKeydown(e: KeyboardEvent) {
  // Enter gửi, Shift+Enter xuống dòng. Đang gõ bộ gõ tiếng Việt (IME) thì Enter
  // là chốt chữ, không phải gửi.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    void send()
  }
}
</script>

<template>
  <section class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-card">
    <header v-if="header && conv" class="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 sm:px-3">
      <button
        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted md:hidden"
        aria-label="Quay lại danh sách"
        @click="emit('back')"
      >
        <UiIcon name="arrow-left" :size="20" />
      </button>
      <ChatAvatar :id="conv.peer.id" :name="conv.peer.full_name" :size="38" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-foreground" data-chat-title>{{ conv.peer.full_name }}</p>
        <p class="truncate text-xs text-muted-foreground">
          {{ ROLE_LABEL[conv.peer.role] || conv.peer.role }}<template v-if="conv.peer.seller_name"> · {{ conv.peer.seller_name }}</template>
        </p>
      </div>
      <span
        v-if="chat.wsState !== 'open'"
        class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
        title="Mất kết nối thời gian thực — đang tự nối lại, tin vẫn được tải bù"
      >
        Đang nối lại…
      </span>
    </header>

    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2" data-chat-scroller @scroll.passive="onScroll">
      <div v-if="loadingOlder" class="flex justify-center py-2"><UiSpinner :size="18" /></div>
      <p v-if="!messages.length" class="px-6 py-12 text-center text-sm text-muted-foreground">
        Chưa có tin nhắn. Gửi lời chào đầu tiên 👋
      </p>
      <template v-for="(m, i) in messages" :key="m.id">
        <div v-if="showDay(i)" class="my-3 text-center text-xs font-medium text-muted-foreground">{{ dayLabel(m.created_at) }}</div>
        <div
          class="flex flex-col"
          :class="[m.sender_id === chat.me ? 'items-end' : 'items-start', isFirst(i) ? 'mt-2' : 'mt-0.5']"
          :data-chat-msg="m.id"
        >
          <div
            class="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed sm:max-w-[75%]"
            :class="[
              m.sender_id === chat.me ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              m.pending === 'sending' ? 'opacity-60' : '',
            ]"
            data-chat-body
          >{{ m.body }}</div>
          <div v-if="m.pending || isLast(i)" class="mt-0.5 px-1 text-[11px] text-muted-foreground">
            <span v-if="m.pending === 'sending'">Đang gửi…</span>
            <span v-else-if="m.pending === 'failed'" class="text-destructive">
              Gửi lỗi · <button class="underline" @click="chat.retry(m)">Thử lại</button> ·
              <button class="underline" @click="chat.discard(m)">Bỏ</button>
            </span>
            <span v-else>{{ clockTime(m.created_at) }}</span>
          </div>
        </div>
      </template>
    </div>

    <button
      v-if="newBelow > 0"
      class="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft"
      @click="scrollToBottom(true)"
    >
      {{ newBelow }} tin mới ↓
    </button>

    <div class="flex shrink-0 items-end gap-1.5 border-t border-border px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
      <textarea
        ref="ta"
        v-model="text"
        rows="1"
        maxlength="4000"
        class="max-h-36 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-input bg-muted/50 px-3.5 py-2 text-base text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 sm:text-sm"
        placeholder="Nhắn tin…"
        data-chat-input
        @input="autosize"
        @keydown="onKeydown"
      />
      <button
        type="button"
        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted disabled:opacity-40"
        :disabled="!text.trim()"
        title="Gửi (Enter)"
        data-chat-send
        @click="send"
      >
        <UiIcon name="send" :size="20" class="rotate-90" />
      </button>
    </div>
  </section>
</template>
