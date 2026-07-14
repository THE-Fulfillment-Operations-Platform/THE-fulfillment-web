<script setup lang="ts">
import { materialsApi } from '~/services/api'
import type { MaterialInput } from '~/services/api'
import type { Material } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { normalizeCode } from '~/utils/code'
import { mapPool } from '~/utils/async'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'
import { useConfirm } from '~/composables/useConfirm'
import { useSelection } from '~/composables/useSelection'
import MaterialQuotaImport from './MaterialQuotaImport.vue'

const props = defineProps<{ materials: Material[]; loading?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToastStore()
const auth = useAuthStore()
const canDelete = computed(() => auth.role === 'OWNER' || auth.role === 'ADMIN')
// Chỉ OWNER được set định mức sản xuất của NVL (khớp guard backend). ADMIN/OPS
// vẫn CRUD material bình thường nhưng ô định mức khoá read-only.
const canSetCapacity = computed(() => auth.role === 'OWNER')

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
const importOpen = ref(false)
const editing = ref<Material | null>(null)
const saving = ref(false)
const form = reactive<MaterialInput>({ code: '', name: '', description: '' })
// Định mức nhập để phân biệt "để trống" (không giới hạn) với số 0.
// v-model trên <input type="number"> có thể trả về number hoặc chuỗi rỗng khi để trống.
const capacity = ref<string | number>('')

function openCreate() {
  editing.value = null
  form.code = ''
  form.name = ''
  form.description = ''
  capacity.value = ''
  open.value = true
}
function openEdit(m: Material) {
  editing.value = m
  form.code = m.code
  form.name = m.name
  form.description = m.description ?? ''
  capacity.value = m.products_per_unit ? String(m.products_per_unit) : ''
  open.value = true
}

// Chuỗi định mức → số dương, hoặc null khi để trống (không giới hạn).
function parseCapacity(): number | null {
  const raw = String(capacity.value).trim()
  const n = Math.floor(Number(raw))
  return raw !== '' && Number.isFinite(n) && n > 0 ? n : null
}

const canSubmit = computed(() => !!form.name.trim() && (!!editing.value || !!form.code.trim()))

async function submit() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    // Chỉ gửi products_per_unit khi user là OWNER — tránh ADMIN/OPS vô tình ghi đè
    // định mức (ô bị khoá nên giá trị nhập không phản ánh ý định của họ).
    if (editing.value) {
      await materialsApi.update(editing.value.id, {
        name: form.name.trim(),
        description: form.description?.trim(),
        ...(canSetCapacity.value ? { products_per_unit: parseCapacity() } : {}),
      })
      toast.success('Đã cập nhật nguyên vật liệu')
    } else {
      await materialsApi.create({
        code: normalizeCode(form.code),
        name: form.name.trim(),
        description: form.description?.trim(),
        ...(canSetCapacity.value ? { products_per_unit: parseCapacity() } : {}),
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

// --- Chọn nhiều dòng để xoá hàng loạt (select-all thao tác trên đúng list đang lọc) ---
const { isSelected, toggle, toggleAll, allSelected, someSelected, count: selectedCount, selectedIds, clear: clearSelection } =
  useSelection(() => filtered.value)

const bulkBusy = ref(false)
async function bulkRemove() {
  const ids = selectedIds.value
  if (!ids.length || bulkBusy.value) return
  if (
    !(await useConfirm().confirm({
      title: 'Xoá nhiều nguyên vật liệu',
      message: `Xoá ${ids.length} nguyên vật liệu đã chọn? Thao tác không thể hoàn tác.`,
      tone: 'danger',
      confirmText: `Xoá ${ids.length} mục`,
    }))
  )
    return
  bulkBusy.value = true
  try {
    const { ok, fail } = await mapPool(ids, 5, (id) => materialsApi.remove(id))
    if (fail === 0) toast.success(`Đã xoá ${ok} nguyên vật liệu`)
    else if (ok === 0) toast.error(`Không xoá được mục nào (${fail} lỗi — có thể đang được SKU sử dụng)`)
    else toast.error(`Đã xoá ${ok}, ${fail} mục lỗi (có thể đang được SKU sử dụng)`)
    clearSelection()
    emit('changed')
  } finally {
    bulkBusy.value = false
  }
}

const removingId = ref<number | null>(null)
async function remove(m: Material) {
  if (
    !(await useConfirm().confirm({
      title: 'Xoá nguyên vật liệu',
      message: `Xoá "${m.name}" (${m.code})? Thao tác không thể hoàn tác.`,
      tone: 'danger',
      confirmText: 'Xoá',
    }))
  )
    return
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
      <div class="flex shrink-0 gap-2">
        <button v-if="canSetCapacity" class="btn-secondary" @click="importOpen = true">
          <UiIcon name="upload" :size="16" /> Import Excel
        </button>
        <button class="btn-primary" @click="openCreate"><UiIcon name="plus" :size="16" /> Thêm material</button>
      </div>
    </div>

    <UiBulkBar v-if="canDelete" :count="selectedCount" noun="nguyên vật liệu" @clear="clearSelection">
      <button class="table-action text-rose-600 disabled:opacity-50 dark:text-rose-400" :disabled="bulkBusy" @click="bulkRemove">
        <UiSpinner v-if="bulkBusy" :size="14" /> Xoá {{ selectedCount }} mục
      </button>
    </UiBulkBar>

    <UiStateBlock
      :loading="loading"
      :empty="!loading && filtered.length === 0"
      empty-text="Chưa có nguyên vật liệu nào."
    >
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-border">
          <thead class="bg-muted">
            <tr>
              <th v-if="canDelete" class="table-th w-10">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                  :checked="allSelected"
                  :indeterminate="someSelected"
                  aria-label="Chọn tất cả"
                  @change="toggleAll"
                />
              </th>
              <th class="table-th">Mã</th>
              <th class="table-th">Tên</th>
              <th class="table-th">Định mức</th>
              <th class="table-th hidden md:table-cell">Mô tả</th>
              <th class="table-th"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="m in filtered" :key="m.id" class="transition-colors duration-150 hover:bg-muted" :class="isSelected(m.id) ? 'bg-accent/40' : ''">
              <td v-if="canDelete" class="table-td">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                  :checked="isSelected(m.id)"
                  :aria-label="`Chọn ${m.code}`"
                  @change="toggle(m.id)"
                />
              </td>
              <td class="table-td font-mono text-xs text-foreground">{{ m.code }}</td>
              <td class="table-td font-medium text-foreground">{{ m.name }}</td>
              <td class="table-td">
                <span v-if="m.products_per_unit" class="inline-flex items-center rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-primary">
                  {{ m.products_per_unit }} sp/đơn vị
                </span>
                <span v-else class="text-xs text-muted-foreground">Không giới hạn</span>
              </td>
              <td class="table-td hidden max-w-md whitespace-normal text-muted-foreground md:table-cell">{{ m.description || '—' }}</td>
              <td class="table-td">
                <div class="flex items-center justify-end gap-1">
                  <button class="table-action text-primary" @click="openEdit(m)">Sửa</button>
                  <button
                    v-if="canDelete"
                    class="table-action text-rose-600 disabled:opacity-50 dark:text-rose-400"
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
          <input
            v-model="form.code"
            class="input font-mono"
            :disabled="!!editing"
            placeholder="VD: MICA-TRONG-3-LY"
            @blur="form.code = normalizeCode(form.code)"
          />
          <p v-if="!editing" class="mt-1 text-[11px] text-muted-foreground">Mã tự động VIẾT HOA, bỏ dấu tiếng Việt và bỏ khoảng trắng.</p>
        </div>
        <div>
          <label class="label">Tên *</label>
          <input v-model="form.name" class="input" placeholder="VD: Mica trong 3 ly" />
        </div>
        <div>
          <label class="label">Định mức sản xuất (sản phẩm / đơn vị NVL)</label>
          <input
            v-model="capacity"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            class="input"
            :disabled="!canSetCapacity"
            placeholder="Để trống = không giới hạn"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">
            <template v-if="canSetCapacity">
              1 đơn vị NVL (1 tấm/1 lô) làm được tối đa bao nhiêu sản phẩm. Khi tạo batch vượt số này, hệ thống tự chẻ thành batch mẹ – nhiều batch con.
            </template>
            <template v-else>
              Chỉ OWNER được chỉnh định mức. {{ editing?.products_per_unit ? `Hiện tại: ${editing.products_per_unit} sp/đơn vị.` : 'Hiện tại: không giới hạn.' }}
            </template>
          </p>
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

    <MaterialQuotaImport v-model="importOpen" @imported="emit('changed')" />
  </div>
</template>
