<script setup lang="ts">
import { useChatStore } from '~/stores/chat'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import type { ChatMessage } from '~/types/chat'
import { fileSize } from '~/utils/chat'

// Ô soạn tin: chữ (Enter gửi, Shift+Enter xuống dòng), đính file (nút kẹp giấy,
// dán ảnh từ clipboard, kéo thả — Thread gọi addFiles), trả lời trích dẫn, sửa
// tin. Gõ chữ thì báo "đang soạn" qua WebSocket.
const props = defineProps<{ convId: number; replyTo: ChatMessage | null; editing: ChatMessage | null }>()
const emit = defineEmits<{ (e: 'cancel-reply'): void; (e: 'cancel-edit'): void; (e: 'sent'): void }>()

const chat = useChatStore()
const toast = useToastStore()
const ta = ref<HTMLTextAreaElement | null>(null)
const picker = ref<HTMLInputElement | null>(null)
const text = ref('')
const files = ref<{ file: File; url: string | null }[]>([])
const MAX_FILES = 10

const canSend = computed(() => !!text.value.trim() || (!props.editing && files.value.length > 0))

/** Ô soạn tự giãn theo chữ, tối đa 5 dòng; dài hơn thì cuộn bên trong ô. */
const MAX_LINES = 5
function autosize() {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  const cs = getComputedStyle(el)
  const line = parseFloat(cs.lineHeight) || 21
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  const max = Math.round(line * MAX_LINES + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + border)
  const want = el.scrollHeight + border
  el.style.height = `${Math.min(want, max)}px`
  el.style.overflowY = want > max ? 'auto' : 'hidden'
}
watch(text, () => nextTick(autosize))

function addFiles(list: FileList | File[] | null | undefined) {
  if (!list || props.editing) return
  if (!chat.filesEnabled) {
    toast.error('Máy chủ chưa bật gửi file trong chat')
    return
  }
  for (const f of Array.from(list)) {
    if (files.value.length >= MAX_FILES) {
      toast.error(`Mỗi tin gửi tối đa ${MAX_FILES} file`)
      break
    }
    if (f.size > chat.fileMaxBytes) {
      toast.error(`“${f.name}” nặng ${fileSize(f.size)} — tối đa ${fileSize(chat.fileMaxBytes)} một file`)
      continue
    }
    // Ảnh dán từ clipboard thường tên "image.png": đặt tên theo giờ cho dễ tìm.
    const named = f.name && f.name !== 'image.png' ? f : new File([f], `anh-dan-${Date.now()}.png`, { type: f.type || 'image/png' })
    files.value.push({ file: named, url: named.type.startsWith('image/') ? URL.createObjectURL(named) : null })
  }
  ta.value?.focus()
}
defineExpose({ addFiles, focus: () => ta.value?.focus() })

function removeFile(i: number) {
  const [x] = files.value.splice(i, 1)
  if (x?.url) URL.revokeObjectURL(x.url)
}
function clearFiles() {
  files.value.forEach((x) => x.url && URL.revokeObjectURL(x.url))
  files.value = []
}

function onPaste(e: ClipboardEvent) {
  const list = e.clipboardData?.files
  if (list && list.length) {
    e.preventDefault()
    addFiles(list)
  }
}

function onInput() {
  autosize()
  if (text.value.trim() && !props.editing) chat.sendTyping(props.convId)
}

async function submit() {
  if (!canSend.value) return
  const body = text.value.trim()
  if (props.editing) {
    const m = props.editing
    if (body === (m.body || '').trim()) {
      emit('cancel-edit')
      return
    }
    try {
      await chat.edit(m, body)
      text.value = ''
      nextTick(autosize)
      emit('cancel-edit')
    } catch (e) {
      toast.error(errorMessage(e))
    }
    return
  }
  const sending = files.value.map((x) => x.file)
  const reply = props.replyTo
  text.value = ''
  clearFiles()
  nextTick(autosize)
  emit('cancel-reply')
  emit('sent')
  try {
    await chat.send(props.convId, body, { replyTo: reply, files: sending })
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

// Bộ gõ có khung soạn (Telex/VNI của macOS, bộ gõ điện thoại): đang soạn thì
// Enter là chốt chữ. Safari bắn keydown Enter SAU compositionend với
// isComposing=false nhưng keyCode 229 — chặn cả hai đường.
const composing = ref(false)
function onKeydown(e: KeyboardEvent) {
  // Enter gửi, Shift+Enter xuống dòng.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !composing.value && e.keyCode !== 229) {
    e.preventDefault()
    void submit()
  } else if (e.key === 'Escape') {
    if (props.editing) {
      text.value = ''
      emit('cancel-edit')
    } else if (props.replyTo) emit('cancel-reply')
  }
}

// Bấm "Sửa" một tin: đổ chữ cũ vào ô; bấm "Trả lời": đưa con trỏ vào ô.
watch(
  () => props.editing,
  (m) => {
    if (m) {
      clearFiles()
      text.value = m.body || ''
    } else if (text.value && !props.replyTo) {
      // thoát sửa: giữ ô trống
      text.value = ''
    }
    nextTick(() => {
      autosize()
      ta.value?.focus()
    })
  },
)
watch(
  () => props.replyTo,
  (m) => {
    if (m) nextTick(() => ta.value?.focus())
  },
)
watch(
  () => props.convId,
  () => {
    text.value = ''
    clearFiles()
  },
)
onBeforeUnmount(clearFiles)
</script>

<template>
  <div class="shrink-0 border-t border-border bg-card pb-[max(0.5rem,env(safe-area-inset-bottom))]">
    <!-- Đang trả lời / đang sửa -->
    <div v-if="editing || replyTo" class="flex items-center gap-2 border-b border-border/70 px-3 py-2 sm:px-4" data-chat-compose-bar>
      <UiIcon :name="editing ? 'pencil' : 'reply'" :size="16" class="shrink-0 text-primary" />
      <span class="min-w-0 flex-1">
        <template v-if="editing">
          <span class="block text-sm font-semibold text-foreground">Đang sửa tin</span>
          <span class="block truncate text-xs text-muted-foreground">Enter để lưu, Esc để huỷ</span>
        </template>
        <template v-else-if="replyTo">
          <span class="block truncate text-sm text-foreground">
            Đang trả lời <b>{{ replyTo.sender_id === chat.me ? 'chính bạn' : replyTo.sender_name }}</b>
          </span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ replyTo.body || (replyTo.attachments?.length ? (replyTo.attachments[0].is_image ? '📷 Ảnh' : `📎 ${replyTo.attachments[0].name}`) : '') }}
          </span>
        </template>
      </span>
      <button
        type="button"
        class="chat-icon-btn h-8 w-8 text-muted-foreground"
        aria-label="Huỷ"
        @click="editing ? (text = '', emit('cancel-edit')) : emit('cancel-reply')"
      >
        <UiIcon name="close" :size="16" />
      </button>
    </div>

    <!-- File chờ gửi -->
    <div v-if="files.length" class="flex gap-2 overflow-x-auto px-3 pt-3 sm:px-4" data-chat-pending-files>
      <div v-for="(x, i) in files" :key="i" class="relative shrink-0">
        <img v-if="x.url" :src="x.url" :alt="x.file.name" class="h-16 w-16 rounded-xl border border-border object-cover" />
        <div v-else class="flex h-16 w-36 flex-col justify-center rounded-xl border border-border bg-muted px-2.5 text-xs">
          <span class="truncate text-sm font-medium text-foreground" :title="x.file.name">{{ x.file.name }}</span>
          <span class="text-muted-foreground">{{ fileSize(x.file.size) }}</span>
        </div>
        <button
          type="button"
          class="chat-focus absolute -right-1.5 -top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background"
          :aria-label="`Bỏ file ${x.file.name}`"
          @click="removeFile(i)"
        >
          <UiIcon name="close" :size="12" />
        </button>
      </div>
    </div>

    <div class="flex items-end gap-1 px-2 pt-2 sm:px-3">
      <button
        v-if="!editing && chat.filesEnabled"
        type="button"
        class="chat-icon-btn h-10 w-10 text-primary"
        title="Gửi ảnh / file (tối đa 20 MB mỗi file) — hoặc dán ảnh, kéo thả vào khung"
        aria-label="Gửi ảnh hoặc file"
        data-chat-attach
        @click="picker?.click()"
      >
        <UiIcon name="paperclip" :size="22" />
      </button>
      <input
        ref="picker"
        type="file"
        multiple
        class="hidden"
        data-chat-file-input
        @change="addFiles(($event.target as HTMLInputElement).files); ($event.target as HTMLInputElement).value = ''"
      />
      <textarea
        ref="ta"
        v-model="text"
        rows="1"
        maxlength="4000"
        enterkeyhint="send"
        :aria-label="editing ? 'Sửa tin nhắn' : 'Nhắn tin'"
        class="min-h-[2.5rem] flex-1 resize-none overflow-y-hidden rounded-[20px] border border-transparent bg-muted px-4 py-2 text-base leading-[1.4] text-foreground placeholder-muted-foreground transition-colors focus:border-ring/60 focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30 [@media(min-width:640px)_and_(pointer:fine)]:text-[15px]"
        :placeholder="editing ? 'Sửa tin…' : 'Nhắn tin…'"
        title="Enter để gửi, Shift+Enter xuống dòng. Gõ mã đơn (106788, 106788_1/2) hoặc mã batch (#101558) là tự thành link."
        data-chat-input
        @input="onInput"
        @keydown="onKeydown"
        @paste="onPaste"
        @compositionstart="composing = true"
        @compositionend="composing = false"
      />
      <button
        type="button"
        class="chat-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-default"
        :class="canSend ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'text-muted-foreground'"
        :disabled="!canSend"
        :title="editing ? 'Lưu (Enter)' : 'Gửi (Enter)'"
        :aria-label="editing ? 'Lưu tin đã sửa' : 'Gửi tin nhắn'"
        data-chat-send
        @click="submit"
      >
        <UiIcon :name="editing ? 'check' : 'send'" :size="19" :class="editing ? '' : 'translate-x-px rotate-90'" />
      </button>
    </div>
  </div>
</template>
