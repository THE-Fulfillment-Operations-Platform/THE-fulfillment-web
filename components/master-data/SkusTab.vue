<script setup lang="ts">
import { skusApi } from '~/services/api'
import type { SkuInput } from '~/services/api'
import type { Material, Sku } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { normalizeCode } from '~/utils/code'
import { mapPool } from '~/utils/async'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'
import { useConfirm } from '~/composables/useConfirm'
import { useSelection } from '~/composables/useSelection'

const props = defineProps<{ skus: Sku[]; materials: Material[]; loading?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToastStore()
const auth = useAuthStore()
const canDelete = computed(() => auth.role === 'OWNER' || auth.role === 'ADMIN')

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.skus
  return props.skus.filter(
    (s) =>
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.product_name ?? '').toLowerCase().includes(q) ||
      (s.materials ?? []).some((m) => (m.material?.name ?? '').toLowerCase().includes(q)),
  )
})

function materialNames(s: Sku): string[] {
  return (s.materials ?? []).map((m) => m.material?.name ?? m.material?.code ?? `#${m.material_id}`)
}

const open = ref(false)
const editing = ref<Sku | null>(null)
const saving = ref(false)
const form = reactive<Required<Omit<SkuInput, 'materials'>>>({
  code: '',
  name: '',
  product_name: '',
  description: '',
  is_active: true,
})
// selected material ids + per-material quantity
const selectedMats = ref<number[]>([])
const qtyByMat = reactive<Record<number, number>>({})

function toggleMat(id: number) {
  const i = selectedMats.value.indexOf(id)
  if (i >= 0) selectedMats.value.splice(i, 1)
  else {
    selectedMats.value.push(id)
    if (!qtyByMat[id]) qtyByMat[id] = 1
  }
}

function openCreate() {
  editing.value = null
  form.code = ''
  form.name = ''
  form.product_name = ''
  form.description = ''
  form.is_active = true
  selectedMats.value = []
  open.value = true
}
function openEdit(s: Sku) {
  editing.value = s
  form.code = s.code
  form.name = s.name
  form.product_name = s.product_name ?? ''
  form.description = s.description ?? ''
  form.is_active = s.is_active ?? true
  selectedMats.value = (s.materials ?? []).map((m) => m.material_id)
  for (const m of s.materials ?? []) qtyByMat[m.material_id] = m.quantity_per_unit || 1
  open.value = true
}

const canSubmit = computed(() => !!form.name.trim() && (!!editing.value || !!form.code.trim()))

function buildMaterials() {
  return selectedMats.value.map((id) => ({ material_id: id, quantity_per_unit: qtyByMat[id] || 1 }))
}

async function submit() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    if (editing.value) {
      // Always send materials on edit so the mapping reflects the current selection.
      await skusApi.update(editing.value.id, {
        name: form.name.trim(),
        product_name: form.product_name.trim(),
        description: form.description.trim(),
        is_active: form.is_active,
        materials: buildMaterials(),
      })
      toast.success('Đã cập nhật SKU')
    } else {
      await skusApi.create({
        code: normalizeCode(form.code),
        name: form.name.trim(),
        product_name: form.product_name.trim(),
        description: form.description.trim(),
        is_active: form.is_active,
        materials: buildMaterials(),
      })
      toast.success('Đã tạo SKU')
    }
    open.value = false
    emit('changed')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

// --- Chọn nhiều dòng để thao tác hàng loạt (ẩn/bật/xoá) ---
const { isSelected, toggle, toggleAll, allSelected, someSelected, count: selectedCount, selectedIds, clear: clearSelection } =
  useSelection(() => filtered.value)

const bulkBusy = ref(false)
async function bulkSetActive(active: boolean) {
  const ids = selectedIds.value
  if (!ids.length || bulkBusy.value) return
  bulkBusy.value = true
  try {
    const { ok, fail } = await mapPool(ids, 5, (id) => skusApi.update(id, { is_active: active }))
    const verb = active ? 'bật' : 'ẩn'
    if (fail === 0) toast.success(`Đã ${verb} ${ok} SKU`)
    else toast.error(`Đã ${verb} ${ok}, ${fail} mục lỗi`)
    clearSelection()
    emit('changed')
  } finally {
    bulkBusy.value = false
  }
}
async function bulkRemove() {
  const ids = selectedIds.value
  if (!ids.length || bulkBusy.value) return
  if (
    !(await useConfirm().confirm({
      title: 'Xoá nhiều SKU',
      message: `Xoá ${ids.length} SKU đã chọn? Thao tác không thể hoàn tác.`,
      tone: 'danger',
      confirmText: `Xoá ${ids.length} mục`,
    }))
  )
    return
  bulkBusy.value = true
  try {
    const { ok, fail } = await mapPool(ids, 5, (id) => skusApi.remove(id))
    if (fail === 0) toast.success(`Đã xoá ${ok} SKU`)
    else if (ok === 0) toast.error(`Không xoá được mục nào (${fail} lỗi)`)
    else toast.error(`Đã xoá ${ok}, ${fail} mục lỗi`)
    clearSelection()
    emit('changed')
  } finally {
    bulkBusy.value = false
  }
}

const togglingId = ref<number | null>(null)
async function toggleActive(s: Sku) {
  togglingId.value = s.id
  try {
    await skusApi.update(s.id, { is_active: !(s.is_active ?? true) })
    toast.success((s.is_active ?? true) ? `Đã ẩn ${s.code}` : `Đã kích hoạt ${s.code}`)
    emit('changed')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    togglingId.value = null
  }
}

const removingId = ref<number | null>(null)
async function remove(s: Sku) {
  if (
    !(await useConfirm().confirm({
      title: 'Xoá SKU',
      message: `Xoá SKU "${s.code}"? Thao tác không thể hoàn tác.`,
      tone: 'danger',
      confirmText: 'Xoá',
    }))
  )
    return
  removingId.value = s.id
  try {
    await skusApi.remove(s.id)
    toast.success('Đã xoá SKU')
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
      <div class="relative sm:w-80">
        <UiIcon name="search" :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input v-model="search" class="input pl-9" placeholder="Tìm theo SKU / tên / nguyên vật liệu…" />
      </div>
      <button class="btn-primary shrink-0" @click="openCreate"><UiIcon name="plus" :size="16" /> Thêm SKU</button>
    </div>

    <UiBulkBar :count="selectedCount" noun="SKU" @clear="clearSelection">
      <button class="table-action text-amber-600 disabled:opacity-50 dark:text-amber-400" :disabled="bulkBusy" @click="bulkSetActive(false)">
        Ẩn
      </button>
      <button class="table-action text-emerald-600 disabled:opacity-50 dark:text-emerald-400" :disabled="bulkBusy" @click="bulkSetActive(true)">
        Bật
      </button>
      <button v-if="canDelete" class="table-action text-rose-600 disabled:opacity-50 dark:text-rose-400" :disabled="bulkBusy" @click="bulkRemove">
        <UiSpinner v-if="bulkBusy" :size="14" /> Xoá {{ selectedCount }} mục
      </button>
    </UiBulkBar>

    <UiStateBlock :loading="loading" :empty="!loading && filtered.length === 0" empty-text="Chưa có SKU nào.">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-border">
          <thead class="bg-muted">
            <tr>
              <th class="table-th w-10">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                  :checked="allSelected"
                  :indeterminate="someSelected"
                  aria-label="Chọn tất cả"
                  @change="toggleAll"
                />
              </th>
              <th class="table-th">SKU</th>
              <th class="table-th">Tên sản phẩm</th>
              <th class="table-th">Nguyên vật liệu</th>
              <th class="table-th">Trạng thái</th>
              <th class="table-th"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="s in filtered" :key="s.id" class="transition-colors duration-150 hover:bg-muted" :class="isSelected(s.id) ? 'bg-accent/40' : ''">
              <td class="table-td">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                  :checked="isSelected(s.id)"
                  :aria-label="`Chọn ${s.code}`"
                  @change="toggle(s.id)"
                />
              </td>
              <td class="table-td font-mono text-xs font-medium text-foreground">{{ s.code }}</td>
              <td class="table-td text-foreground">{{ s.product_name || s.name }}</td>
              <td class="table-td whitespace-normal">
                <div v-if="materialNames(s).length" class="flex flex-wrap gap-1">
                  <span
                    v-for="n in materialNames(s)"
                    :key="n"
                    class="inline-flex items-center rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground"
                  >
                    {{ n }}
                  </span>
                  <span v-if="s.is_combo" class="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">Combo</span>
                </div>
                <span v-else class="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                  <UiIcon name="alert" :size="12" /> Chưa gán NVL
                </span>
              </td>
              <td class="table-td">
                <span
                  class="inline-flex items-center gap-1 text-xs font-medium"
                  :class="(s.is_active ?? true) ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'"
                >
                  <span class="h-1.5 w-1.5 rounded-full" :class="(s.is_active ?? true) ? 'bg-emerald-500' : 'bg-muted-foreground/40'" />
                  {{ (s.is_active ?? true) ? 'Active' : 'Ẩn' }}
                </span>
              </td>
              <td class="table-td">
                <div class="flex items-center justify-end gap-1">
                  <button
                    class="table-action disabled:opacity-50"
                    :class="(s.is_active ?? true) ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'"
                    :disabled="togglingId === s.id"
                    @click="toggleActive(s)"
                  >
                    {{ (s.is_active ?? true) ? 'Ẩn' : 'Bật' }}
                  </button>
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

    <UiModal v-model="open" :title="editing ? 'Sửa SKU' : 'Thêm SKU'" wide>
      <div class="space-y-4">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Mã SKU *</label>
            <input
              v-model="form.code"
              class="input font-mono"
              :disabled="!!editing"
              placeholder="VD: WOOD-01"
              @blur="form.code = normalizeCode(form.code)"
            />
            <p v-if="!editing" class="mt-1 text-[11px] text-muted-foreground">Mã tự động VIẾT HOA, bỏ dấu tiếng Việt và bỏ khoảng trắng.</p>
          </div>
          <div>
            <label class="label">Tên *</label>
            <input v-model="form.name" class="input" placeholder="Tên SKU" />
          </div>
        </div>
        <div>
          <label class="label">Tên sản phẩm</label>
          <input v-model="form.product_name" class="input" placeholder="Tên hiển thị sản phẩm (tuỳ chọn)" />
        </div>
        <div>
          <label class="label">Mô tả</label>
          <textarea v-model="form.description" rows="2" class="input" placeholder="Ghi chú (tuỳ chọn)" />
        </div>

        <div>
          <label class="label">Nguyên vật liệu (chọn 1 hoặc nhiều cho combo)</label>
          <p class="mb-2 text-[11px] text-muted-foreground">
            Để trống nếu chưa biết — SKU sẽ được đánh dấu “chưa gán NVL” và có thể map sau ở tab “SKU → Material”. Hệ thống không tự đoán.
          </p>
          <div v-if="!materials.length" class="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
            Chưa có nguyên vật liệu. Tạo material trước ở tab “Materials”.
          </div>
          <div v-else class="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            <label
              v-for="m in materials"
              :key="m.id"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                :checked="selectedMats.includes(m.id)"
                @change="toggleMat(m.id)"
              />
              <span class="flex-1 text-sm text-foreground">{{ m.name }} <span class="text-xs text-muted-foreground">({{ m.code }})</span></span>
              <input
                v-if="selectedMats.includes(m.id)"
                v-model.number="qtyByMat[m.id]"
                type="number"
                min="1"
                class="input w-20 py-1 text-sm"
                title="Số lượng / đơn vị"
              />
            </label>
          </div>
          <p v-if="selectedMats.length > 1" class="mt-1 text-[11px] text-violet-600 dark:text-violet-400">
            SKU nhiều nguyên vật liệu sẽ được đánh dấu là Combo.
          </p>
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
