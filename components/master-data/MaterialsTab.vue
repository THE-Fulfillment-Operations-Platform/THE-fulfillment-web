<script setup lang="ts">
import { materialsApi } from '~/services/api'
import type { MaterialInput } from '~/services/api'
import type { Material } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'

const props = defineProps<{ materials: Material[]; loading?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToastStore()
const auth = useAuthStore()
const canDelete = computed(() => auth.role === 'OWNER' || auth.role === 'ADMIN')

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.materials
  return props.materials.filter(
    (m) =>
      m.code.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      (m.description ?? '').toLowerCase().includes(q),
  )
})

const open = ref(false)
const editing = ref<Material | null>(null)
const saving = ref(false)
const form = reactive<MaterialInput>({ code: '', name: '', description: '' })

function openCreate() {
  editing.value = null
  form.code = ''
  form.name = ''
  form.description = ''
  open.value = true
}
function openEdit(m: Material) {
  editing.value = m
  form.code = m.code
  form.name = m.name
  form.description = m.description ?? ''
  open.value = true
}

const canSubmit = computed(() => !!form.name.trim() && (!!editing.value || !!form.code.trim()))

async function submit() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    if (editing.value) {
      await materialsApi.update(editing.value.id, {
        name: form.name.trim(),
        description: form.description?.trim(),
      })
      toast.success('Đã cập nhật nguyên vật liệu')
    } else {
      await materialsApi.create({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description?.trim(),
      })
      toast.success('Đã tạo nguyên vật liệu')
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
async function remove(m: Material) {
  if (!confirm(`Xoá nguyên vật liệu "${m.name}" (${m.code})?`)) return
  removingId.value = m.id
  try {
    await materialsApi.remove(m.id)
    toast.success('Đã xoá nguyên vật liệu')
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
        <input v-model="search" class="input pl-9" placeholder="Tìm theo mã / tên / mô tả…" />
      </div>
      <button class="btn-primary shrink-0" @click="openCreate"><UiIcon name="plus" :size="16" /> Thêm material</button>
    </div>

    <UiStateBlock
      :loading="loading"
      :empty="!loading && filtered.length === 0"
      empty-text="Chưa có nguyên vật liệu nào."
    >
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-border">
          <thead class="bg-muted">
            <tr>
              <th class="table-th">Mã</th>
              <th class="table-th">Tên</th>
              <th class="table-th">Mô tả</th>
              <th class="table-th"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="m in filtered" :key="m.id" class="hover:bg-muted">
              <td class="table-td font-mono text-xs text-foreground">{{ m.code }}</td>
              <td class="table-td font-medium text-foreground">{{ m.name }}</td>
              <td class="table-td max-w-md whitespace-normal text-muted-foreground">{{ m.description || '—' }}</td>
              <td class="table-td">
                <div class="flex items-center justify-end gap-3">
                  <button class="text-xs font-medium text-primary hover:underline" @click="openEdit(m)">Sửa</button>
                  <button
                    v-if="canDelete"
                    class="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
                    :disabled="removingId === m.id"
                    @click="remove(m)"
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

    <UiModal v-model="open" :title="editing ? 'Sửa nguyên vật liệu' : 'Thêm nguyên vật liệu'">
      <div class="space-y-4">
        <div>
          <label class="label">Mã material *</label>
          <input v-model="form.code" class="input font-mono" :disabled="!!editing" placeholder="VD: MICA-TRONG-3-LY" />
          <p v-if="!editing" class="mt-1 text-[11px] text-muted-foreground">Mã sẽ được tự động viết hoa.</p>
        </div>
        <div>
          <label class="label">Tên *</label>
          <input v-model="form.name" class="input" placeholder="VD: Mica trong 3 ly" />
        </div>
        <div>
          <label class="label">Mô tả</label>
          <textarea v-model="form.description" rows="2" class="input" placeholder="Ghi chú thêm (tuỳ chọn)" />
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
