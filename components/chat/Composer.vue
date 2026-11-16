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

function autosize() {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}

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

function onKeydown(e: KeyboardEvent) {
  // Enter gửi, Shift+Enter xuống dòng. Đang gõ bộ gõ tiếng Việt (IME) thì Enter
  // là chốt chữ, không phải gửi.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
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
  <div class="shrink-0 border-t border-border pb-[max(0.5rem,env(safe-area-inset-bottom))]">
    <!-- Đang trả lời / đang sửa -->
    <div v-if="editing || replyTo" class="flex items-center gap-2 px-3 pt-2 text-xs" data-chat-compose-bar>
      <UiIcon :name="editing ? 'pencil' : 'reply'" :size="14" class="shrink-0 text-primary" />
      <span class="min-w-0 flex-1 truncate text-muted-foreground">
        <template v-if="editing">Đang sửa tin · Enter để lưu, Esc để huỷ</template>
        <template v-else-if="replyTo">
          Trả lời <b class="text-foreground">{{ replyTo.sender_id === chat.me ? 'chính bạn' : replyTo.sender_name }}</b>:
          {{ replyTo.body || (replyTo.attachments?.length ? (replyTo.attachments[0].is_image ? '📷 Ảnh' : `📎 ${replyTo.attachments[0].name}`) : '') }}
        </template>
      </span>
      <button
        type="button"
        class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        aria-label="Huỷ"
        @click="editing ? (text = '', emit('cancel-edit')) : emit('cancel-reply')"
      >
        <UiIcon name="close" :size="14" />
      </button>
    </div>

    <!-- File chờ gửi -->
    <div v-if="files.length" class="flex gap-2 overflow-x-auto px-3 pt-2" data-chat-pending-files>
      <div v-for="(x, i) in files" :key="i" class="relative shrink-0">
        <img v-if="x.url" :src="x.url" :alt="x.file.name" class="h-16 w-16 rounded-lg border border-border object-cover" />
        <div v-else class="flex h-16 w-32 flex-col justify-center rounded-lg border border-border bg-muted px-2 text-xs">
          <span class="truncate font-medium text-foreground" :title="x.file.name">{{ x.file.name }}</span>
          <span class="text-muted-foreground">{{ fileSize(x.file.size) }}</span>
        </div>
        <button
          type="button"
          class="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background"
          aria-label="Bỏ file"
          @click="removeFile(i)"
        >
          <UiIcon name="close" :size="11" />
        </button>
      </div>
    </div>

    <div class="flex items-end gap-1.5 px-2 pt-2">
      <button
        v-if="!editing && chat.filesEnabled"
        type="button"
        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted"
        title="Gửi ảnh / file (tối đa 20 MB mỗi file) — hoặc dán ảnh, kéo thả vào khung"
        aria-label="Gửi ảnh hoặc file"
        data-chat-attach
        @click="picker?.click()"
      >
        <UiIcon name="paperclip" :size="20" />
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
        class="max-h-40 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-input bg-muted/50 px-3.5 py-2 text-base text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 sm:text-sm"
        :placeholder="editing ? 'Sửa tin…' : 'Nhắn tin…'"
        title="Enter để gửi, Shift+Enter xuống dòng. Gõ mã đơn (106788, 106788_1/2) hoặc mã batch (#101558) là tự thành link."
        data-chat-input
        @input="onInput"
        @keydown="onKeydown"
        @paste="onPaste"
      />
      <button
        type="button"
        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted disabled:opacity-40"
        :disabled="!canSend"
        :title="editing ? 'Lưu (Enter)' : 'Gửi (Enter)'"
        data-chat-send
        @click="submit"
      >
        <UiIcon :name="editing ? 'check' : 'send'" :size="20" :class="editing ? '' : 'rotate-90'" />
      </button>
    </div>
  </div>
</template>
