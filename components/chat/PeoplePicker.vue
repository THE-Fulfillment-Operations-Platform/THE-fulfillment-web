<script setup lang="ts">
import { chatApi } from '~/services/api/chat'
import { useChatStore } from '~/stores/chat'
import type { ChatUser } from '~/types/chat'
import { ROLE_LABEL } from '~/utils/enums'
import { foldVi } from '~/utils/chat'
import { errorMessage } from '~/utils/api-error'

// Chọn người. Danh bạ do API lọc sẵn: chỉ tài khoản nội bộ đang hoạt động, được
// mở chat. multiple=true: chọn nhiều (tạo nhóm / thêm người) qua v-model.
const props = withDefaults(defineProps<{ multiple?: boolean; exclude?: number[]; modelValue?: number[] }>(), {
  multiple: false,
  exclude: () => [],
  modelValue: () => [],
})
const emit = defineEmits<{
  (e: 'pick', u: ChatUser): void
  (e: 'update:modelValue', ids: number[]): void
}>()
const chat = useChatStore()

const q = ref('')
const users = ref<ChatUser[]>([])
const loading = ref(true)
const error = ref('')
const input = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  input.value?.focus()
  try {
    users.value = (await chatApi.users()).data || []
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
})

const available = computed(() => users.value.filter((u) => !props.exclude.includes(u.id)))
const shown = computed(() => {
  const term = foldVi(q.value.trim())
  return available.value.filter((u) => !term || foldVi(`${u.full_name} ${u.email || ''}`).includes(term))
})
const selected = computed(() => new Set(props.modelValue))
function onPick(u: ChatUser) {
  if (!props.multiple) return emit('pick', u)
  const next = new Set(selected.value)
  if (next.has(u.id)) next.delete(u.id)
  else next.add(u.id)
  emit('update:modelValue', [...next])
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-2">
    <input ref="input" v-model="q" class="input" placeholder="Tìm người theo tên, email…" data-chat-people-search />
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="loading" class="p-4 text-center text-sm text-muted-foreground">Đang tải…</p>
      <p v-else-if="!available.length" class="p-4 text-center text-sm text-muted-foreground" data-chat-people-empty>
        Danh bạ trống: chưa có tài khoản nội bộ nào khác đang hoạt động
        {{ exclude.length ? 'ngoài những người đã ở trong nhóm' : 'trên hệ thống' }}.
      </p>
      <p v-else-if="!shown.length" class="p-4 text-center text-sm text-muted-foreground">
        Không có ai khớp “{{ q.trim() }}”. Thử gõ tên khác hoặc email.
      </p>
      <button
        v-for="u in shown"
        :key="u.id"
        type="button"
        class="chat-focus flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted"
        :class="multiple && selected.has(u.id) ? 'bg-accent' : ''"
        :aria-pressed="multiple ? selected.has(u.id) : undefined"
        :data-chat-person="u.email || u.full_name"
        @click="onPick(u)"
      >
        <ChatAvatar :id="u.id" :name="u.full_name" :size="40" :online="!!chat.online[u.id]" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[15px] font-medium text-foreground">{{ u.full_name }}</span>
          <span class="block truncate text-[13px] text-muted-foreground">{{ ROLE_LABEL[u.role] || u.role }}</span>
        </span>
        <span
          v-if="multiple"
          class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
          :class="selected.has(u.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border'"
        >
          <UiIcon v-if="selected.has(u.id)" name="check" :size="13" />
        </span>
      </button>
    </div>
  </div>
</template>
