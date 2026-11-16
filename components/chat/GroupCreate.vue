<script setup lang="ts">
import { chatApi } from '~/services/api/chat'
import { useChatStore } from '~/stores/chat'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import type { ChatConversation } from '~/types/chat'

// Tạo nhóm: đặt tên + chọn người (từ 1 người trở lên ngoài mình).
const emit = defineEmits<{ (e: 'created', c: ChatConversation): void; (e: 'cancel'): void }>()
const chat = useChatStore()
const toast = useToastStore()
const title = ref('')
const ids = ref<number[]>([])
const busy = ref(false)
const ready = computed(() => !!title.value.trim() && ids.value.length > 0 && !busy.value)

async function create() {
  if (!ready.value) return
  busy.value = true
  try {
    const { data } = await chatApi.createGroup(title.value.trim(), ids.value)
    chat.upsertConversation(data)
    emit('created', data)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-2" data-chat-group-create>
    <input v-model="title" class="input" maxlength="120" placeholder="Tên nhóm, ví dụ: Tổ in UV ca ngày" data-chat-group-title />
    <p class="text-xs text-muted-foreground">
      Chọn người ({{ ids.length }} đã chọn). Bạn là người tạo nhóm — cùng Owner/Admin quản lý thành viên.
    </p>
    <ChatPeoplePicker v-model="ids" multiple />
    <div class="flex shrink-0 justify-end gap-2 pt-1">
      <button type="button" class="btn-secondary" @click="emit('cancel')">Huỷ</button>
      <button type="button" class="btn-primary" :disabled="!ready" data-chat-group-submit @click="create">
        {{ busy ? 'Đang tạo…' : 'Tạo nhóm' }}
      </button>
    </div>
  </div>
</template>
