<script setup lang="ts">
import { chatApi } from '~/services/api/chat'
import { useChatStore } from '~/stores/chat'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'
import { errorMessage } from '~/utils/api-error'
import { ROLE_LABEL } from '~/utils/enums'
import { presenceLabel } from '~/utils/chat'

// Thông tin nhóm: đổi tên (mọi thành viên), danh sách thành viên + ai đang
// online, thêm / bớt người (người tạo nhóm, Owner/Admin), rời nhóm.
const props = defineProps<{ convId: number }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'left'): void }>()
const chat = useChatStore()
const toast = useToastStore()
const { confirm } = useConfirm()

const conv = computed(() => chat.byId(props.convId))
const title = ref(conv.value?.title || '')
const adding = ref(false)
const addIds = ref<number[]>([])
const busy = ref(false)
watch(
  () => conv.value?.title,
  (t) => {
    if (t !== undefined) title.value = t
  },
)
const memberIds = computed(() => (conv.value?.members || []).map((m) => m.id))

async function run(fn: () => Promise<unknown>) {
  busy.value = true
  try {
    await fn()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}
function rename() {
  const t = title.value.trim()
  if (!t || t === conv.value?.title) return
  return run(async () => {
    const { data } = await chatApi.rename(props.convId, t)
    chat.upsertConversation(data)
    toast.success('Đã đổi tên nhóm')
  })
}
function add() {
  if (!addIds.value.length) return
  return run(async () => {
    const { data } = await chatApi.addMembers(props.convId, addIds.value)
    chat.upsertConversation(data)
    adding.value = false
    addIds.value = []
  })
}
async function remove(id: number, name: string) {
  if (!(await confirm({ title: 'Mời ra khỏi nhóm?', message: `${name} sẽ không đọc / nhắn được trong nhóm này nữa.`, confirmText: 'Mời ra', tone: 'danger' })))
    return
  await run(async () => {
    await chatApi.removeMember(props.convId, id)
    await chat.refreshConversation(props.convId)
  })
}
async function leave() {
  if (!(await confirm({ title: 'Rời nhóm?', message: 'Bạn sẽ không còn thấy nhóm và tin trong nhóm. Muốn vào lại phải nhờ người tạo nhóm / Owner / Admin thêm.', confirmText: 'Rời nhóm', tone: 'danger' })))
    return
  await run(async () => {
    await chatApi.removeMember(props.convId, chat.me)
    chat.dropConversation(props.convId)
    emit('left')
  })
}
</script>

<template>
  <div v-if="conv" class="flex min-h-0 flex-1 flex-col gap-3" data-chat-group-info>
    <div>
      <label class="label">Tên nhóm</label>
      <div class="flex gap-2">
        <input v-model="title" class="input" maxlength="120" data-chat-group-rename @keydown.enter="rename" />
        <button type="button" class="btn-secondary" :disabled="busy || !title.trim() || title.trim() === conv.title" @click="rename">Lưu</button>
      </div>
    </div>

    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold text-foreground">{{ conv.members.length }} thành viên</p>
      <button v-if="conv.can_manage && !adding" type="button" class="btn-secondary !py-1.5" data-chat-group-add @click="adding = true">
        <UiIcon name="user-add" :size="15" /> Thêm người
      </button>
    </div>

    <div v-if="adding" class="flex min-h-[14rem] flex-col gap-2 rounded-xl border border-border p-2">
      <ChatPeoplePicker v-model="addIds" multiple :exclude="memberIds" />
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary !py-1.5" @click="adding = false; addIds = []">Huỷ</button>
        <button type="button" class="btn-primary !py-1.5" :disabled="busy || !addIds.length" data-chat-group-add-submit @click="add">
          Thêm {{ addIds.length || '' }}
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-for="m in conv.members" :key="m.id" class="flex items-center gap-3 rounded-xl px-1 py-1.5" :data-chat-member="m.email || m.full_name">
        <ChatAvatar :id="m.id" :name="m.full_name" :size="36" :online="!!chat.online[m.id]" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-foreground">
            {{ m.full_name }}<template v-if="m.id === chat.me"> (bạn)</template>
            <span v-if="m.id === conv.created_by_id" class="ml-1 rounded bg-accent px-1 py-0.5 text-[10px] font-semibold text-accent-foreground">Người tạo</span>
          </span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ ROLE_LABEL[m.role] || m.role }}
            <template v-if="presenceLabel(!!chat.online[m.id], chat.lastSeen[m.id], chat.tick)"> · {{ presenceLabel(!!chat.online[m.id], chat.lastSeen[m.id], chat.tick) }}</template>
          </span>
        </span>
        <button
          v-if="conv.can_manage && m.id !== chat.me"
          type="button"
          class="rounded-lg px-2 py-1 text-xs font-medium text-destructive hover:bg-muted"
          data-chat-member-remove
          :disabled="busy"
          @click="remove(m.id, m.full_name)"
        >
          Mời ra
        </button>
      </div>
    </div>

    <div class="flex shrink-0 justify-between gap-2 border-t border-border pt-3">
      <button type="button" class="btn-danger !py-1.5" :disabled="busy" data-chat-group-leave @click="leave">
        <UiIcon name="logout" :size="15" /> Rời nhóm
      </button>
      <button type="button" class="btn-secondary !py-1.5" @click="emit('close')">Đóng</button>
    </div>
  </div>
</template>
