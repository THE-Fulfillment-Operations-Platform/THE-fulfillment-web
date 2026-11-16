<script setup lang="ts">
import { chatApi } from '~/services/api/chat'
import type { ChatUser } from '~/types/chat'
import { ROLE_LABEL } from '~/utils/enums'
import { foldVi } from '~/utils/chat'
import { errorMessage } from '~/utils/api-error'

// Chọn người để nhắn. Danh bạ do API lọc sẵn: chỉ người mình được nhắn
// (cùng được mở chat; seller không thấy seller khác).
const emit = defineEmits<{ (e: 'pick', u: ChatUser): void }>()

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

const shown = computed(() => {
  const term = foldVi(q.value.trim())
  return users.value.filter((u) => !term || foldVi(`${u.full_name} ${u.email || ''} ${u.seller_name || ''}`).includes(term))
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-2">
    <input ref="input" v-model="q" class="input" placeholder="Tìm người theo tên, email…" data-chat-people-search />
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="loading" class="p-4 text-center text-sm text-muted-foreground">Đang tải…</p>
      <p v-else-if="!shown.length" class="p-4 text-center text-sm text-muted-foreground">Không có ai để nhắn</p>
      <button
        v-for="u in shown"
        :key="u.id"
        type="button"
        class="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted"
        :data-chat-person="u.email || u.full_name"
        @click="emit('pick', u)"
      >
        <ChatAvatar :id="u.id" :name="u.full_name" :size="36" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-foreground">{{ u.full_name }}</span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ ROLE_LABEL[u.role] || u.role }}<template v-if="u.seller_name"> · {{ u.seller_name }}</template>
          </span>
        </span>
      </button>
    </div>
  </div>
</template>
