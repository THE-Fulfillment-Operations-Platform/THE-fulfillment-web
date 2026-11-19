<script setup lang="ts">
import { useChatStore } from '~/stores/chat'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import { ROLE_LABEL } from '~/utils/enums'
import type { ChatAttachment, ChatMember, ChatMessage } from '~/types/chat'
import { convTitle, presenceLabel, sameDay, separatorLabel } from '~/utils/chat'

// Khung nhắn của một cuộc: luồng tin + ô soạn. Dùng ở trang đầy đủ (có đầu khung)
// và trong ô chat nhỏ (ô chat tự vẽ đầu khung của nó: header=false). Kéo thả
// file vào khung để gửi; bấm ảnh / PDF để xem ngay; "đã xem" dưới tin.
const props = withDefaults(defineProps<{ convId: number; header?: boolean }>(), { header: true })
const emit = defineEmits<{ (e: 'back'): void }>()

const chat = useChatStore()
const toast = useToastStore()

const conv = computed(() => chat.byId(props.convId))
const isGroup = computed(() => conv.value?.kind === 'group')
const messages = computed<ChatMessage[]>(() => chat.messages[props.convId] || [])
const scroller = ref<HTMLElement | null>(null)
const composer = ref<{ addFiles: (f: FileList | File[]) => void; focus: () => void } | null>(null)
const loadingOlder = ref(false)
const atBottom = ref(true)
const newBelow = ref(0)
const replyTo = ref<ChatMessage | null>(null)
const editing = ref<ChatMessage | null>(null)
const media = ref<{ items: ChatAttachment[]; index: number } | null>(null)
const infoOpen = ref(false)
const dragging = ref(false)
const flash = ref<number | null>(null)
/** Đã tải xong lượt đầu (trước đó hiện vòng xoay, không hiện "Chưa có tin nhắn"). */
const loaded = ref(!!chat.messages[props.convId])

const subtitle = computed(() => {
  const c = conv.value
  if (!c) return ''
  if (c.kind === 'group') {
    const on = c.members.filter((m) => m.id !== chat.me && chat.online[m.id]).length
    return `${c.members.length} thành viên${on ? ` · ${on} đang hoạt động` : ''}`
  }
  const p = c.peer
  if (!p) return ''
  const pres = presenceLabel(!!chat.online[p.id], chat.lastSeen[p.id], chat.tick)
  return [ROLE_LABEL[p.role] || p.role, pres].filter(Boolean).join(' · ')
})
const typingText = computed(() => {
  const names = chat.typingNames(props.convId)
  if (!names.length) return ''
  if (!isGroup.value) return 'Đang soạn tin…'
  const short = names.map((n) => n.split(' ').slice(-1)[0])
  return `${short.slice(0, 3).join(', ')}${short.length > 3 ? '…' : ''} đang soạn tin…`
})
/** Người đang soạn (để vẽ avatar cạnh bong bóng ba chấm). */
const typingMember = computed<ChatMember | null>(() => {
  const map = chat.typing[props.convId] || {}
  const id = Object.entries(map).find(([, exp]) => exp > chat.tick)?.[0]
  return id ? conv.value?.members.find((m) => m.id === Number(id)) || null : null
})

// Gom tin như Messenger: tin liền nhau của cùng người, cách nhau ≤ 2 phút là một
// cụm (nối góc, avatar ở tin cuối, tên ở tin đầu). Cách > 10 phút hoặc sang ngày
// thì chen mốc thời gian ("Hôm nay 14:05") — giờ từng tin xem khi rê chuột.
const GROUP_GAP_MS = 2 * 60_000
const SEPARATOR_GAP_MS = 10 * 60_000
function gap(a: ChatMessage, b: ChatMessage) {
  return a.sender_id !== b.sender_id || a.kind === 'system' || b.kind === 'system' || !sameDay(a.created_at, b.created_at) ||
    Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) > GROUP_GAP_MS
}
function isFirst(i: number) {
  const p = messages.value[i - 1]
  return !p || gap(p, messages.value[i])
}
function isLast(i: number) {
  const n = messages.value[i + 1]
  return !n || gap(messages.value[i], n)
}
function showSeparator(i: number) {
  const p = messages.value[i - 1]
  const m = messages.value[i]
  return !p || !sameDay(p.created_at, m.created_at) || Date.parse(m.created_at) - Date.parse(p.created_at) > SEPARATOR_GAP_MS
}

// Đã xem: mỗi thành viên (trừ mình) hiện ở dưới tin mới nhất họ đã xem.
const readers = computed<Record<number, ChatMember[]>>(() => {
  const c = conv.value
  const list = messages.value.filter((m) => m.id > 0)
  const out: Record<number, ChatMember[]> = {}
  if (!c || !list.length) return out
  for (const mb of c.members) {
    if (mb.id === chat.me || !mb.last_read_message_id) continue
    let target: ChatMessage | undefined
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].id <= mb.last_read_message_id) {
        target = list[i]
        break
      }
    }
    if (!target || target.sender_id === mb.id) continue
    ;(out[target.id] ||= []).push(mb)
  }
  return out
})
const tailId = computed(() => {
  const list = messages.value
  return list.length ? list[list.length - 1].id : 0
})

// ---------------- cuộn ----------------
function scrollToBottom(smooth = false) {
  const el = scroller.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  newBelow.value = 0
}
// Ảnh chưa biết kích thước tải xong làm luồng cao thêm: đang ở đáy thì giữ đáy.
function onMediaLoad(e: Event) {
  if ((e.target as HTMLElement)?.tagName === 'IMG' && atBottom.value) scrollToBottom()
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

// Theo tin CUỐI (không theo độ dài): tải tin cũ ở đầu luồng không bị tính là "tin mới".
watch(
  () => tailId.value,
  async (id, old) => {
    if (!old || id === old) return
    const list = messages.value
    const last = list[list.length - 1]
    await nextTick()
    if (atBottom.value || last?.sender_id === chat.me) scrollToBottom(true)
    else newBelow.value += 1
  },
)
// "Đang soạn…" hiện ở cuối: đang ở đáy thì giữ đáy.
watch(typingText, async () => {
  if (!atBottom.value) return
  await nextTick()
  scrollToBottom(true)
})

async function scrollToMessage(id: number) {
  await nextTick()
  const el = scroller.value?.querySelector(`[data-chat-msg="${id}"]`) as HTMLElement | null
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  flash.value = id
  setTimeout(() => {
    if (flash.value === id) flash.value = null
  }, 2200)
}
async function jump(id: number) {
  try {
    if (!(await chat.jumpTo(props.convId, id))) {
      toast.error('Không tìm thấy tin đó nữa (có thể đã quá cũ hoặc bị thu hồi)')
      return
    }
  } catch (e) {
    toast.error(errorMessage(e))
    return
  }
  await scrollToMessage(id)
}
// Kết quả tìm kiếm trỏ vào cuộc đang mở sẵn.
watch(
  () => chat.highlight,
  (h) => {
    if (!h || h.convId !== props.convId || chat.activeId !== props.convId) return
    chat.highlight = null
    void jump(h.id)
  },
)

async function open() {
  newBelow.value = 0
  atBottom.value = true
  replyTo.value = null
  editing.value = null
  try {
    await chat.openConversation(props.convId)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loaded.value = true
  }
  await nextTick()
  const h = chat.highlight
  if (h && h.convId === props.convId) {
    chat.highlight = null
    scrollToBottom()
    await jump(h.id)
  } else {
    scrollToBottom()
  }
  composer.value?.focus()
}
watch(() => props.convId, open)
// Khung tin bị thu thấp (ô soạn giãn thêm dòng, thanh trả lời / file chờ gửi hiện
// ra, bàn phím điện thoại bật lên): đang ở đáy thì giữ đáy như Messenger.
let resizeObs: ResizeObserver | null = null
onMounted(() => {
  void open()
  if (scroller.value && typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(() => {
      const el = scroller.value
      if (el && atBottom.value) el.scrollTop = el.scrollHeight
    })
    resizeObs.observe(scroller.value)
  }
})
onBeforeUnmount(() => {
  resizeObs?.disconnect()
  if (chat.activeId === props.convId) chat.activeId = null
})
// Mình bị mời ra / rời nhóm ở tab khác: cuộc biến mất → quay về danh sách.
watch(conv, (c, prev) => {
  if (!c && prev) emit('back')
})

// ---------------- kéo thả file ----------------
let dragDepth = 0
function hasFiles(e: DragEvent) {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')
}
function onDragEnter(e: DragEvent) {
  if (!hasFiles(e) || !chat.filesEnabled) return
  dragDepth++
  dragging.value = true
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}
function onDrop(e: DragEvent) {
  dragDepth = 0
  dragging.value = false
  if (e.dataTransfer?.files?.length) composer.value?.addFiles(e.dataTransfer.files)
}

function startReply(m: ChatMessage) {
  editing.value = null
  replyTo.value = m
}
function startEdit(m: ChatMessage) {
  replyTo.value = null
  editing.value = m
}
async function togglePin() {
  try {
    await chat.togglePin(props.convId)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
defineExpose({ openInfo: () => (infoOpen.value = true) })
</script>

<template>
  <section
    class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-card"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <header v-if="header && conv" class="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-2 sm:px-4">
      <button
        class="chat-icon-btn h-10 w-10 text-primary md:hidden"
        aria-label="Quay lại danh sách"
        @click="emit('back')"
      >
        <UiIcon name="arrow-left" :size="22" />
      </button>
      <ChatAvatar
        :id="conv.peer?.id || conv.id"
        :name="convTitle(conv)"
        :size="40"
        :group="isGroup"
        :online="!isGroup && !!conv.peer && !!chat.online[conv.peer.id]"
      />
      <button type="button" class="chat-focus min-w-0 flex-1 rounded-lg text-left" :disabled="!isGroup" @click="infoOpen = true">
        <p class="truncate text-base font-semibold leading-tight text-foreground" data-chat-title>{{ convTitle(conv) }}</p>
        <p class="mt-0.5 truncate text-[13px]" :class="typingText ? 'italic text-primary' : 'text-muted-foreground'" data-chat-subtitle>
          {{ typingText || subtitle }}
        </p>
      </button>
      <span
        v-if="chat.wsState !== 'open'"
        class="hidden rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 sm:inline"
        title="Mất kết nối thời gian thực — đang tự nối lại, tin vẫn được tải bù"
      >
        Đang nối lại…
      </span>
      <button
        type="button"
        class="chat-icon-btn h-10 w-10"
        :class="conv.pinned_at ? 'text-primary' : 'text-muted-foreground'"
        :title="conv.pinned_at ? 'Bỏ ghim' : 'Ghim lên đầu danh sách'"
        :aria-label="conv.pinned_at ? 'Bỏ ghim' : 'Ghim lên đầu danh sách'"
        data-chat-thread-pin
        @click="togglePin"
      >
        <UiIcon name="pin" :size="19" />
      </button>
      <button
        v-if="isGroup"
        type="button"
        class="chat-icon-btn h-10 w-10 text-muted-foreground"
        title="Thành viên, đổi tên, rời nhóm"
        aria-label="Thông tin nhóm"
        data-chat-group-info-open
        @click="infoOpen = true"
      >
        <UiIcon name="info" :size="20" />
      </button>
    </header>

    <div
      ref="scroller"
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 sm:px-4"
      data-chat-scroller
      @scroll.passive="onScroll"
      @load.capture="onMediaLoad"
    >
      <div v-if="loadingOlder" class="flex justify-center py-2"><UiSpinner :size="18" /></div>
      <div v-if="!loaded && !messages.length" class="flex justify-center py-12"><UiSpinner :size="22" /></div>
      <p v-else-if="!messages.length" class="px-6 py-12 text-center text-[15px] text-muted-foreground">
        Chưa có tin nhắn. Gửi lời chào đầu tiên 👋
      </p>
      <template v-if="conv">
        <template v-for="(m, i) in messages" :key="m.id">
          <div v-if="showSeparator(i)" class="mb-1 mt-5 text-center text-xs font-medium text-muted-foreground" data-chat-time-sep>
            {{ separatorLabel(m.created_at, chat.tick) }}
          </div>
          <ChatBubble
            :m="m"
            :conv="conv"
            :first="isFirst(i)"
            :last="isLast(i)"
            :readers="readers[m.id] || []"
            :is-tail="m.id === tailId"
            :highlight="flash === m.id"
            :compact="!header"
            @reply="startReply"
            @edit="startEdit"
            @media="(items, index) => (media = { items, index })"
            @jump="jump"
          />
        </template>
      </template>
      <!-- Đang soạn: avatar + bong bóng ba chấm như Messenger -->
      <div v-if="typingText" class="mt-3 flex items-end gap-2" data-chat-typing>
        <span class="mb-0.5 w-7 shrink-0">
          <ChatAvatar v-if="typingMember" :id="typingMember.id" :name="typingMember.full_name" :size="28" />
        </span>
        <span class="inline-flex items-center gap-1 rounded-[18px] bg-chat-other px-3.5 py-3" aria-hidden="true">
          <span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.3s]" />
          <span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.15s]" />
          <span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70" />
        </span>
        <span class="mb-1 min-w-0 truncate text-xs italic text-muted-foreground" role="status">{{ typingText }}</span>
      </div>
    </div>

    <button
      v-if="newBelow > 0"
      class="chat-focus absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-soft"
      @click="scrollToBottom(true)"
    >
      {{ newBelow }} tin mới ↓
    </button>

    <ChatComposer
      ref="composer"
      :conv-id="convId"
      :reply-to="replyTo"
      :editing="editing"
      @cancel-reply="replyTo = null"
      @cancel-edit="editing = null"
      @sent="scrollToBottom(true)"
    />

    <!-- Kéo thả file -->
    <div
      v-if="dragging"
      class="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 text-sm font-semibold text-primary"
      data-chat-dropzone
    >
      Thả ảnh / file vào đây để gửi (tối đa 20 MB mỗi file)
    </div>

    <ChatLightbox v-if="media" :items="media.items" :index="media.index" @close="media = null" />

    <UiModal :model-value="infoOpen && isGroup" title="Thông tin nhóm" @update:model-value="infoOpen = $event">
      <div class="flex h-[65vh] flex-col">
        <ChatGroupInfo v-if="infoOpen" :conv-id="convId" @close="infoOpen = false" @left="infoOpen = false; emit('back')" />
      </div>
    </UiModal>
  </section>
</template>
