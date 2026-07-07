<script setup lang="ts">
import { sellersApi } from '~/services/api'
import type { Seller } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'
import { useConfirm } from '~/composables/useConfirm'

// Seller (gian hàng) management. A Seller is the business entity that owns a
// batch of orders; a SELLER-role user account is then linked to it by id. This
// tab is where those entities are created so the Users form can reference them.
const props = defineProps<{ sellers: Seller[]; loading?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToastStore()
const auth = useAuthStore()
const canDelete = computed(() => auth.role === 'OWNER' || auth.role === 'ADMIN')

const STATUS_OPTIONS = [
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'paused', label: 'Tạm dừng' },
]

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.sellers
  return props.sellers.filter(
    (s) =>
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.contact_email ?? '').toLowerCase().includes(q) ||
      (s.contact_phone ?? '').toLowerCase().includes(q),
  )
})

interface SellerForm {
  code: string
  name: string
  contact_email: string
  contact_phone: string
  status: string
  note: string
}

const open = ref(false)
const editing = ref<Seller | null>(null)
const saving = ref(false)
const form = reactive<SellerForm>({
  code: '',
  name: '',
  contact_email: '',
  contact_phone: '',
  status: 'active',
  note: '',
})

function openCreate() {
  editing.value = null
  form.code = ''
  form.name = ''
  form.contact_email = ''
  form.contact_phone = ''
  form.status = 'active'
  form.note = ''
  open.value = true
}
function openEdit(s: Seller) {
  editing.value = s
  form.code = s.code
  form.name = s.name
  form.contact_email = s.contact_email ?? ''
  form.contact_phone = s.contact_phone ?? ''
  form.status = s.status ?? 'active'
  form.note = s.note ?? ''
  open.value = true
}

const canSubmit = computed(() => !!form.name.trim() && (!!editing.value || !!form.code.trim()))

async function submit() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      contact_email: form.contact_email.trim(),
      contact_phone: form.contact_phone.trim(),
      status: form.status,
      note: form.note.trim(),
    }
    if (editing.value) {
      await sellersApi.update(editing.value.id, payload)
      toast.success('Đã cập nhật seller')
    } else {
      await sellersApi.create({ ...payload, code: normalizeCode(form.code) })
      toast.success('Đã tạo seller')
    }
    open.value = false
    emit('changed')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

const removingId = ref<number | null>(null)
async function remove(s: Seller) {
  if (
    !(await useConfirm().confirm({
      title: 'Xoá seller',
      message: `Xoá seller "${s.name}" (${s.code})?\nKhông xoá được nếu đang có tài khoản hoặc đơn hàng gắn với seller này.`,
      tone: 'danger',
      confirmText: 'Xoá',
    }))
  )
    return
  removingId.value = s.id
  try {
    await sellersApi.remove(s.id)
    toast.success('Đã xoá seller')
    emit('changed')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <div class="card overflow-hidden">
    <div class="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="relative sm:w-72">
        <UiIcon name="search" :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input v-model="search" class="input pl-9" placeholder="Tìm theo mã / tên / liên hệ…" />
      </div>
      <button class="btn-primary shrink-0" @click="openCreate"><UiIcon name="plus" :size="16" /> Thêm seller</button>
    </div>

    <UiStateBlock
      :loading="loading"
      :empty="!loading && filtered.length === 0"
      empty-text="Chưa có seller nào. Bấm “Thêm seller” để tạo mới."
    >
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-border">
          <thead class="bg-muted">
            <tr>
              <th class="table-th">ID</th>
              <th class="table-th">Mã</th>
              <th class="table-th">Tên</th>
              <th class="table-th">Liên hệ</th>
              <th class="table-th">Trạng thái</th>
              <th class="table-th"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="s in filtered" :key="s.id" class="hover:bg-muted">
              <td class="table-td font-mono text-xs text-muted-foreground">#{{ s.id }}</td>
              <td class="table-td font-mono text-xs text-foreground">{{ s.code }}</td>
              <td class="table-td font-medium text-foreground">{{ s.name }}</td>
              <td class="table-td text-xs text-muted-foreground">
                <p v-if="s.contact_email">{{ s.contact_email }}</p>
                <p v-if="s.contact_phone">{{ s.contact_phone }}</p>
                <span v-if="!s.contact_email && !s.contact_phone">—</span>
              </td>
              <td class="table-td">
                <span
                  class="inline-flex items-center gap-1 text-xs font-medium"
                  :class="(s.status ?? 'active') === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'"
                >
                  <span class="h-1.5 w-1.5 rounded-full" :class="(s.status ?? 'active') === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground/40'" />
                  {{ (s.status ?? 'active') === 'active' ? 'Đang hoạt động' : 'Tạm dừng' }}
                </span>
              </td>
              <td class="table-td">
                <div class="flex items-center justify-end gap-1">
                  <button class="table-action text-primary" @click="openEdit(s)">Sửa</button>
                  <button
                    v-if="canDelete"
                    class="table-action text-rose-600 disabled:opacity-50 dark:text-rose-400"
                    :disabled="removingId === s.id"
                    @click="remove(s)"
                  >
                    Xoá
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiStateBlock>

    <UiModal v-model="open" :title="editing ? 'Sửa seller' : 'Thêm seller'">
      <div class="space-y-4">
        <div>
          <label class="label">Mã seller *</label>
          <input
            v-model="form.code"
            class="input font-mono"
            :disabled="!!editing"
            placeholder="VD: SELLER02"
            @blur="form.code = normalizeCode(form.code)"
          />
          <p v-if="!editing" class="mt-1 text-[11px] text-muted-foreground">Mã tự động VIẾT HOA, bỏ dấu tiếng Việt và bỏ khoảng trắng. Không đổi được sau khi tạo.</p>
        </div>
        <div>
          <label class="label">Tên seller *</label>
          <input v-model="form.name" class="input" placeholder="VD: Cửa hàng ABC" />
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Email liên hệ</label>
            <input v-model="form.contact_email" type="email" class="input" placeholder="lienhe@cuahang.com" />
          </div>
          <div>
            <label class="label">SĐT liên hệ</label>
            <input v-model="form.contact_phone" class="input" placeholder="09xxxxxxxx" />
          </div>
        </div>
        <div>
          <label class="label">Trạng thái</label>
          <UiSelect v-model="form.status" :options="STATUS_OPTIONS" aria-label="Trạng thái" />
        </div>
        <div>
          <label class="label">Ghi chú</label>
          <textarea v-model="form.note" rows="2" class="input" placeholder="Ghi chú thêm (tuỳ chọn)" />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="open = false">Huỷ</button>
        <button class="btn-primary" :disabled="!canSubmit || saving" @click="submit">
          <UiSpinner v-if="saving" :size="16" /> {{ editing ? 'Lưu' : 'Tạo' }}
        </button>
      </template>
    </UiModal>
  </div>
</template>
