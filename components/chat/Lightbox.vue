<script setup lang="ts">
import { chatAssetUrl } from '~/services/api/chat'
import type { ChatAttachment } from '~/types/chat'
import { fileSize } from '~/utils/chat'

// Xem ảnh / PDF gửi trong chat ngay trên trang (← → chuyển ảnh, Esc đóng).
const props = defineProps<{ items: ChatAttachment[]; index: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const i = ref(props.index)
watch(
  () => props.index,
  (v) => (i.value = v),
)
const cur = computed(() => props.items[i.value])
const isPdf = computed(() => cur.value?.mime === 'application/pdf')

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  } else if (e.key === 'ArrowRight' && i.value < props.items.length - 1) i.value++
  else if (e.key === 'ArrowLeft' && i.value > 0) i.value--
}
onMounted(() => document.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[65] flex flex-col bg-slate-950/90"
      role="dialog"
      aria-label="Xem file"
      data-chat-overlay
      data-chat-lightbox
      @click.self="emit('close')"
    >
      <div class="flex h-12 shrink-0 items-center gap-2 px-3 text-sm text-white">
        <span class="min-w-0 flex-1 truncate" :title="cur?.name">{{ cur?.name }} · {{ fileSize(cur?.size || 0) }}</span>
        <span v-if="items.length > 1" class="text-white/70">{{ i + 1 }}/{{ items.length }}</span>
        <a
          v-if="cur"
          :href="chatAssetUrl(cur.download_url)"
          :download="cur.name"
          class="inline-flex h-9 items-center gap-1 rounded-lg px-3 hover:bg-white/10"
        >
          <UiIcon name="download" :size="16" /> Tải về
        </a>
        <button class="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Đóng" @click="emit('close')">
          <UiIcon name="close" :size="20" />
        </button>
      </div>
      <div class="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4" @click.self="emit('close')">
        <iframe v-if="cur && isPdf" :src="chatAssetUrl(cur.url)" class="h-full w-full max-w-5xl rounded-lg bg-white" title="PDF" data-chat-pdf />
        <img
          v-else-if="cur"
          :src="chatAssetUrl(cur.url)"
          :alt="cur.name"
          class="max-h-full max-w-full rounded-lg object-contain"
          data-chat-lightbox-img
        />
        <button
          v-if="i > 0"
          class="absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          aria-label="Ảnh trước"
          @click="i--"
        >
          <UiIcon name="chevron-left" :size="22" />
        </button>
        <button
          v-if="i < items.length - 1"
          class="absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          aria-label="Ảnh sau"
          @click="i++"
        >
          <UiIcon name="chevron-right" :size="22" />
        </button>
      </div>
    </div>
  </Teleport>
</template>
