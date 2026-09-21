<script setup lang="ts">
// Khu thả file. Nhận kéo-thả, chọn từ máy, và dán thẳng từ clipboard (Ctrl+V) —
// designer hay copy ảnh từ Photoshop/Figma chứ không lưu ra file trước.
const props = withDefaults(defineProps<{ compact?: boolean; busy?: boolean }>(), {
  compact: false,
  busy: false,
})
const emit = defineEmits<{ (e: 'files', files: File[]): void }>()

const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

const ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.ai,image/*,application/pdf'

function pick() {
  input.value?.click()
}
function onInput(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? [])
  if (files.length) emit('files', files)
  ;(e.target as HTMLInputElement).value = ''
}
function onDrop(e: DragEvent) {
  dragging.value = false
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (files.length) emit('files', files)
}
function onPaste(e: ClipboardEvent) {
  const files = Array.from(e.clipboardData?.files ?? [])
  if (files.length) emit('files', files)
}
onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
</script>

<template>
  <!-- Bản gọn: một ô vuông nhỏ nằm cuối băng file, chỉ để thêm file tiếp. -->
  <button
    v-if="props.compact"
    class="flex h-[3.25rem] w-[6.5rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed text-xs font-medium transition-colors"
    :class="dragging ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground'"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
    @click="pick"
  >
    <UiIcon name="plus" :size="15" />
    Thêm file
    <input ref="input" type="file" class="hidden" multiple :accept="ACCEPT" @change="onInput" />
  </button>

  <div
    v-else
    class="rounded-2xl border-2 border-dashed px-6 py-14 transition-colors"
    :class="dragging ? 'border-primary bg-primary/5' : 'border-border bg-card'"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <div class="flex flex-col items-center gap-3 text-center">
      <div class="rounded-full bg-muted p-3 text-muted-foreground">
        <UiIcon name="upload" :size="26" />
      </div>
      <div>
        <p class="text-lg font-semibold text-foreground">Kéo file thiết kế vào đây</p>
        <p class="mt-1 text-xs text-muted-foreground">
          PNG nền trong suốt · JPG/PNG nền trắng · PDF · AI (lưu kèm PDF) — hoặc dán bằng Ctrl+V
        </p>
      </div>
      <button class="btn-primary" :disabled="props.busy" @click="pick">
        <UiIcon name="plus" :size="16" /> Chọn file
      </button>
      <p class="max-w-md text-xs text-muted-foreground">
        Ảnh không rời khỏi máy: toàn bộ việc tách hình, dựng đường cắt và đóng gói chạy ngay trong
        trình duyệt, không gửi gì lên máy chủ.
      </p>
    </div>
    <input ref="input" type="file" class="hidden" multiple :accept="ACCEPT" @change="onInput" />
  </div>
</template>
