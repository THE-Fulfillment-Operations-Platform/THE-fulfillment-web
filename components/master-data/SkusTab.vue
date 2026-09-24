<script setup lang="ts">
import { skusApi } from '~/services/api'
import type { SkuInput } from '~/services/api'
import type { Material, Sku } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { normalizeCode } from '~/utils/code'
import { formatDimMM } from '~/utils/format'
import { quotaInfo, quotaLabel, estimatedQuota, QUOTA_TITLE, type QuotaSource } from '~/utils/quota'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'
import { useConfirm } from '~/composables/useConfirm'
import { useSelection } from '~/composables/useSelection'
import { useClientPager } from '~/composables/useClientPager'
import SkuImportDialog from './SkuImportDialog.vue'
import ParentSkuImportDialog from './ParentSkuImportDialog.vue'

const props = defineProps<{ skus: Sku[]; materials: Material[]; loading?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void; (e: 'imported'): void }>()

// Import theo 2 bước: SKU cha trước (ParentSkuImportDialog), SKU con sau
// (SkuImportDialog — chính là import Excel vận hành cũ, thêm cột SKU cha + D/R).
const importOpen = ref(false)
const parentImportOpen = ref(false)

const toast = useToastStore()
const auth = useAuthStore()
// Thêm/sửa = "Thao tác" màn Master Data; xoá cần thêm vai trò Admin/Owner.
const canManage = computed(() => auth.can('master_data.manage'))
const canDelete = computed(() => (auth.role === 'OWNER' || auth.role === 'ADMIN') && canManage.value)

// ---- Cây SKU cha → con --------------------------------------------------------
// Đúng 2 tầng: SKU cấp trên cùng (cha, hoặc SKU lẻ) và các SKU con của nó. Con
// trỏ tới một cha không còn trong danh sách thì coi như cấp trên cùng — không để
// nó biến khỏi bảng.
const byId = computed(() => new Map(props.skus.map((s) => [s.id, s])))
const childrenOf = computed(() => {
  const m = new Map<number, Sku[]>()
  for (const s of props.skus) {
    if (s.parent_id == null || !byId.value.has(s.parent_id)) continue
    const arr = m.get(s.parent_id)
    if (arr) arr.push(s)
    else m.set(s.parent_id, [s])
  }
  return m
})
function kids(s: Sku): Sku[] {
  return childrenOf.value.get(s.id) ?? []
}
function isTopLevel(s: Sku): boolean {
  return s.parent_id == null || !byId.value.has(s.parent_id)
}
const parentCount = computed(() => childrenOf.value.size)

const search = ref('')
// Chỉ hiện các SKU cha — nhìn một lượt xem mỗi cha đang chứa bao nhiêu con.
const onlyParents = ref(false)

function matches(s: Sku, q: string): boolean {
  return (
    s.code.toLowerCase().includes(q) ||
    s.name.toLowerCase().includes(q) ||
    (s.product_name ?? '').toLowerCase().includes(q) ||
    materialChips(s).some((c) => c.label.toLowerCase().includes(q))
  )
}

// Mỗi nhóm = một SKU cấp trên cùng + các con cần hiện. Tìm trúng cha → hiện đủ
// con; chỉ trúng con → hiện cha kèm đúng những con trúng, và tự mở nhóm ra.
interface Group {
  sku: Sku
  children: Sku[]
  matchedByChild: boolean
}
const groups = computed<Group[]>(() => {
  const q = search.value.trim().toLowerCase()
  const out: Group[] = []
  for (const s of props.skus) {
    if (!isTopLevel(s)) continue
    const all = kids(s)
    if (onlyParents.value && !all.length) continue
    if (!q || matches(s, q)) {
      out.push({ sku: s, children: all, matchedByChild: false })
      continue
    }
    const hit = all.filter((c) => matches(c, q))
    if (hit.length) out.push({ sku: s, children: hit, matchedByChild: true })
  }
  return out
})

const expanded = ref<Set<number>>(new Set())
function isOpen(g: Group): boolean {
  return g.matchedByChild || expanded.value.has(g.sku.id)
}
function toggleOpen(id: number) {
  const next = new Set(expanded.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expanded.value = next
}
const allOpen = computed(() => groups.value.every((g) => !g.children.length || isOpen(g)))
function toggleAllOpen() {
  expanded.value = allOpen.value ? new Set() : new Set(groups.value.filter((g) => g.children.length).map((g) => g.sku.id))
}

// Phân trang theo NHÓM, không theo dòng: một cha không bị cắt rời khỏi các con
// sang trang sau.
const { paged, meta, pageSize, setPage, setPageSize } = useClientPager(() => groups.value)

interface Row {
  sku: Sku
  child: boolean
  group: Group
}
function rowsOf(list: Group[]): Row[] {
  return list.flatMap((g) => [
    { sku: g.sku, child: false, group: g },
    ...(isOpen(g) ? g.children.map((c) => ({ sku: c, child: true, group: g })) : []),
  ])
}
const pagedRows = computed(() => rowsOf(paged.value))
// "Chọn tất cả" chỉ lấy những dòng đang nhìn thấy: con của nhóm đang đóng không
// bị chọn ngầm (xoá cha mà con còn lại thì server bỏ qua cha kèm lý do).
const visibleSkus = computed(() => rowsOf(groups.value).map((r) => r.sku))

// Chip NVL kèm định mức "· 40/tấm" (khai) hoặc "· ~24/tấm" (ước tính theo kích
// thước). Không có số = chưa khai và một trong hai bên chưa có kích thước.
function materialChips(s: Sku): { key: string; label: string; quota: string; source: QuotaSource }[] {
  return (s.materials ?? []).map((m) => {
    const name = m.material?.name ?? m.material?.code ?? `#${m.material_id}`
    const info = quotaInfo(s, m.material)
    return { key: name, label: name, quota: quotaLabel(info), source: info.source }
  })
}

// ---- Form thêm / sửa ------------------------------------------------------------
const open = ref(false)
const editing = ref<Sku | null>(null)
const saving = ref(false)
const form = reactive<Required<Pick<SkuInput, 'code' | 'name' | 'product_name' | 'description' | 'is_active'>>>({
  code: '',
  name: '',
  product_name: '',
  description: '',
  is_active: true,
})
// SKU cha chọn từ dropdown có ô lọc (mã + tên) — danh sách cha có thể vài trăm
// dòng. 0 = không thuộc cha nào. Kích thước giữ dạng chuỗi để phân biệt "để trống".
const parentId = ref(0)
const lengthMM = ref<string | number>('')
const widthMM = ref<string | number>('')
// selected material ids + per-material quantity + per-material declared quota
const selectedMats = ref<number[]>([])
const qtyByMat = reactive<Record<number, number>>({})
// Định mức KHAI cho từng NVL (sp/tấm, từ file layout của xưởng). '' = chưa khai
// → hệ thống ước tính theo kích thước.
const quotaByMat = reactive<Record<number, number | ''>>({})
// Ước tính của SKU đang nhập trên NVL m, tính sống từ hai ô D/R và kích thước
// tấm — để người nhập thấy ngay "80 × 60 trên tấm 600 × 800 ≈ 91/tấm".
function liveQuota(m: Material): number {
  return estimatedQuota({ length_mm: parseDim(lengthMM.value), width_mm: parseDim(widthMM.value) }, m)
}

// SKU đang sửa mà có con thì không gán cha được (chỉ 2 tầng).
const editingKids = computed(() => (editing.value ? kids(editing.value) : []))
// Ứng viên SKU cha: mọi SKU cấp trên cùng, trừ chính nó (2 tầng: SKU con không
// làm cha được, nên không cần liệt kê).
const parentOptions = computed(() => [
  { value: 0, label: 'Không thuộc SKU cha nào' },
  ...props.skus
    .filter((s) => s.parent_id == null && s.id !== editing.value?.id)
    .map((s) => ({ value: s.id, label: s.code, sublabel: s.product_name || s.name })),
])
const resolvedParent = computed(() => (parentId.value ? byId.value.get(parentId.value) ?? null : null))

function toggleMat(id: number) {
  const i = selectedMats.value.indexOf(id)
  if (i >= 0) selectedMats.value.splice(i, 1)
  else {
    selectedMats.value.push(id)
    if (!qtyByMat[id]) qtyByMat[id] = 1
    if (quotaByMat[id] == null) quotaByMat[id] = ''
  }
}

function openCreate(parent?: Sku) {
  editing.value = null
  form.code = ''
  form.name = ''
  form.product_name = ''
  form.description = ''
  form.is_active = true
  parentId.value = parent?.id ?? 0
  lengthMM.value = ''
  widthMM.value = ''
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
  parentId.value = s.parent_id ?? 0
  lengthMM.value = s.length_mm ?? ''
  widthMM.value = s.width_mm ?? ''
  selectedMats.value = (s.materials ?? []).map((m) => m.material_id)
  for (const m of s.materials ?? []) {
    qtyByMat[m.material_id] = m.quantity_per_unit || 1
    quotaByMat[m.material_id] = m.products_per_unit && m.products_per_unit > 0 ? m.products_per_unit : ''
  }
  open.value = true
}

// Ô kích thước → số mm dương, hoặc null khi để trống / không hợp lệ.
function parseDim(v: string | number): number | null {
  const raw = String(v).trim().replace(',', '.')
  const n = Number(raw)
  return raw !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

// D và R phải đi đôi: một ô có số, ô kia trống thì BE từ chối — chặn ngay ở nút.
const sizeError = computed(() => {
  const l = parseDim(lengthMM.value)
  const w = parseDim(widthMM.value)
  return (l == null) !== (w == null) ? 'Nhập cả D lẫn R, hoặc bỏ trống cả hai' : ''
})
const canSubmit = computed(
  () => !!form.name.trim() && (!!editing.value || !!form.code.trim()) && !sizeError.value,
)

function buildMaterials() {
  return selectedMats.value.map((id) => {
    const q = Number(quotaByMat[id])
    return {
      material_id: id,
      quantity_per_unit: qtyByMat[id] || 1,
      // Ô trống / 0 = chưa khai → gửi null, server ước tính theo kích thước.
      products_per_unit: Number.isFinite(q) && q > 0 ? Math.floor(q) : null,
    }
  })
}

async function submit() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  const parent = parentId.value || null
  try {
    if (editing.value) {
      // Luôn gửi đủ: 0 = xoá (tách khỏi cha / bỏ kích thước), vì form đang hiện
      // đúng giá trị hiện tại nên ô trống nghĩa là người dùng muốn bỏ.
      await skusApi.update(editing.value.id, {
        name: form.name.trim(),
        product_name: form.product_name.trim(),
        description: form.description.trim(),
        is_active: form.is_active,
        parent_id: parent ?? 0,
        length_mm: parseDim(lengthMM.value) ?? 0,
        width_mm: parseDim(widthMM.value) ?? 0,
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
        parent_id: parent,
        length_mm: parseDim(lengthMM.value),
        width_mm: parseDim(widthMM.value),
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
const { isSelected, toggle, rowClick, toggleAll, allSelected, someSelected, count: selectedCount, selectedIds, clear: clearSelection } =
  useSelection(() => visibleSkus.value)

const bulkBusy = ref(false)
async function bulkSetActive(active: boolean) {
  const ids = selectedIds.value
  if (!ids.length || bulkBusy.value) return
  bulkBusy.value = true
  try {
    // MỘT request: server đổi cờ bằng một câu UPDATE ... WHERE id IN (...). Gửi
    // từng id (kiểu cũ) tốn 1 round-trip + 1 lần lưu cả SKU cho mỗi dòng.
    const { data } = await skusApi.bulkSetActive(ids, active)
    const verb = active ? 'bật' : 'ẩn'
    toast.success(`Đã ${verb} ${data?.updated ?? ids.length} SKU`)
    clearSelection()
    emit('changed')
  } catch (e) {
    toast.error(errorMessage(e))
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
    const { data } = await skusApi.bulkRemove(ids)
    const ok = data?.deleted_ids.length ?? 0
    const skipped = data?.skipped ?? []
    if (!skipped.length) toast.success(`Đã xoá ${ok} SKU`)
    else {
      // Lý do thật từ server (SKU đang có đơn hàng dùng / SKU cha còn con) + vài mã.
      const reasons = [...new Set(skipped.map((s) => s.reason))].join(', ')
      const names = skipped.slice(0, 3).map((s) => s.code || s.id).join(', ')
      const more = skipped.length > 3 ? `… +${skipped.length - 3}` : ''
      const detail = `${skipped.length} mục bỏ qua (${reasons}): ${names}${more}`
      if (ok) toast.error(`Đã xoá ${ok}, ${detail}`)
      else toast.error(`Không xoá được mục nào — ${detail}`)
    }
    clearSelection()
    emit('changed')
  } catch (e) {
    toast.error(errorMessage(e))
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
    <div class="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div class="relative sm:w-80">
          <UiIcon name="search" :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input v-model="search" class="input pl-9" placeholder="Tìm theo SKU / tên / nguyên vật liệu…" />
        </div>
        <label class="flex items-center gap-2 text-sm text-muted-foreground">
          <input v-model="onlyParents" type="checkbox" class="h-4 w-4 rounded border-border text-primary focus:ring-ring" />
          Chỉ SKU cha <span class="tabular-nums">({{ parentCount }})</span>
        </label>
        <button v-if="parentCount" class="text-left text-xs text-primary hover:underline" @click="toggleAllOpen">
          {{ allOpen ? 'Thu gọn tất cả' : 'Mở tất cả SKU con' }}
        </button>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <button
          v-if="canManage"
          class="btn-secondary"
          title="Bước 1: tạo các SKU cha (vd Hộp nhựa) trước"
          @click="parentImportOpen = true"
        >
          <UiIcon name="upload" :size="16" /> Import SKU cha
        </button>
        <button
          v-if="canManage"
          class="btn-secondary"
          title="Bước 2: import SKU con (cột SKU cha phải trỏ tới SKU cha đã có) — cũng dùng cho file vận hành cũ"
          @click="importOpen = true"
        >
          <UiIcon name="upload" :size="16" /> Import SKU con
        </button>
        <button v-if="canManage" class="btn-primary" @click="openCreate()"><UiIcon name="plus" :size="16" /> Thêm SKU</button>
      </div>
    </div>

    <UiBulkBar v-if="canManage" :count="selectedCount" noun="SKU" @clear="clearSelection">
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

    <UiStateBlock :loading="loading" :empty="!loading && groups.length === 0" empty-text="Chưa có SKU nào.">
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
              <th class="table-th">D x R</th>
              <th class="table-th">Nguyên vật liệu</th>
              <th class="table-th">Trạng thái</th>
              <th class="table-th"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="r in pagedRows"
              :key="r.sku.id"
              class="cursor-pointer transition-colors duration-150 hover:bg-muted"
              :class="isSelected(r.sku.id) ? 'bg-accent/40' : r.child ? 'bg-muted/40' : ''"
              @click="rowClick(r.sku.id, $event)"
            >
              <td class="table-td">
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-ring"
                  :checked="isSelected(r.sku.id)"
                  :aria-label="`Chọn ${r.sku.code}`"
                  @change="toggle(r.sku.id)"
                />
              </td>
              <td class="table-td font-mono text-xs font-medium text-foreground">
                <!-- Dòng con thụt vào dưới cha; dòng cha có nút mở/đóng + số con. -->
                <div class="flex items-center gap-1.5" :class="r.child ? 'pl-7' : ''">
                  <span v-if="r.child" class="text-muted-foreground">└</span>
                  <button
                    v-else-if="kids(r.sku).length"
                    class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    :aria-label="isOpen(r.group) ? 'Thu gọn SKU con' : 'Mở SKU con'"
                    @click="toggleOpen(r.sku.id)"
                  >
                    <UiIcon :name="isOpen(r.group) ? 'chevron-down' : 'chevron-right'" :size="14" />
                  </button>
                  <span v-else class="inline-block w-[18px]" />
                  <span>{{ r.sku.code }}</span>
                  <button
                    v-if="!r.child && kids(r.sku).length"
                    class="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-sky-700 hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300"
                    :title="kids(r.sku).map((c) => c.code).join(', ')"
                    @click="toggleOpen(r.sku.id)"
                  >
                    <UiIcon name="layers" :size="11" />
                    <template v-if="r.group.matchedByChild">{{ r.group.children.length }}/</template>{{ kids(r.sku).length }} SKU con
                  </button>
                </div>
              </td>
              <td class="table-td text-foreground">{{ r.sku.product_name || r.sku.name }}</td>
              <td class="table-td whitespace-nowrap tabular-nums text-muted-foreground">
                {{ formatDimMM(r.sku.length_mm, r.sku.width_mm) }}
              </td>
              <td class="table-td whitespace-normal">
                <div v-if="materialChips(r.sku).length" class="flex flex-wrap gap-1">
                  <span
                    v-for="c in materialChips(r.sku)"
                    :key="c.key"
                    class="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground"
                  >
                    {{ c.label }}
                    <span v-if="c.quota" class="tabular-nums text-muted-foreground" :title="QUOTA_TITLE[c.source]">· {{ c.quota }}</span>
                  </span>
                  <span v-if="r.sku.is_combo" class="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">Combo</span>
                </div>
                <!-- SKU cha chỉ để gom nhóm, không sản xuất trực tiếp — không có NVL
                     là bình thường, không báo đỏ. -->
                <span v-else-if="kids(r.sku).length" class="text-xs text-muted-foreground">SKU cha — NVL theo từng SKU con</span>
                <span v-else class="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                  <UiIcon name="alert" :size="12" /> Chưa gán NVL
                </span>
              </td>
              <td class="table-td">
                <span
                  class="inline-flex items-center gap-1 text-xs font-medium"
                  :class="(r.sku.is_active ?? true) ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'"
                >
                  <span class="h-1.5 w-1.5 rounded-full" :class="(r.sku.is_active ?? true) ? 'bg-emerald-500' : 'bg-muted-foreground/40'" />
                  {{ (r.sku.is_active ?? true) ? 'Active' : 'Ẩn' }}
                </span>
              </td>
              <td class="table-td">
                <div class="flex items-center justify-end gap-1">
                  <button
                    v-if="canManage && !r.child && r.sku.parent_id == null"
                    class="table-action text-sky-600 dark:text-sky-400"
                    title="Thêm SKU con vào SKU này"
                    @click="openCreate(r.sku)"
                  >
                    + Con
                  </button>
                  <button
                    v-if="canManage"
                    class="table-action disabled:opacity-50"
                    :class="(r.sku.is_active ?? true) ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'"
                    :disabled="togglingId === r.sku.id"
                    @click="toggleActive(r.sku)"
                  >
                    {{ (r.sku.is_active ?? true) ? 'Ẩn' : 'Bật' }}
                  </button>
                  <button v-if="canManage" class="table-action text-primary" @click="openEdit(r.sku)">Sửa</button>
                  <button
                    v-if="canDelete"
                    class="table-action text-rose-600 disabled:opacity-50 dark:text-rose-400"
                    :disabled="removingId === r.sku.id"
                    @click="remove(r.sku)"
                  >
                    Xoá
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="px-4">
        <UiPagination
          :meta="meta"
          :page-size="pageSize"
          @change="setPage"
          @update:page-size="setPageSize"
        />
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

        <!-- SKU cha + kích thước -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label class="label">SKU cha</label>
            <UiSelect
              v-model="parentId"
              :options="parentOptions"
              searchable
              search-placeholder="Gõ mã hoặc tên SKU cha…"
              placeholder="Không thuộc SKU cha nào"
              :disabled="editingKids.length > 0"
              aria-label="SKU cha"
            />
            <p v-if="editingKids.length" class="mt-1 text-[11px] text-muted-foreground">
              SKU này đang là cha của {{ editingKids.length }} SKU con — không gán cha cho nó được (chỉ 2 tầng).
            </p>
            <p v-else-if="resolvedParent" class="mt-1 text-[11px] text-muted-foreground">
              {{ resolvedParent.product_name || resolvedParent.name }}
            </p>
          </div>
          <div>
            <label class="label">D — dài (mm)</label>
            <input v-model="lengthMM" type="number" min="0" step="0.01" class="input" placeholder="VD: 80" />
          </div>
          <div>
            <label class="label">R — rộng (mm)</label>
            <input v-model="widthMM" type="number" min="0" step="0.01" class="input" placeholder="VD: 60" />
            <p v-if="sizeError" class="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{{ sizeError }}</p>
          </div>
        </div>
        <p class="-mt-2 text-[11px] text-muted-foreground">
          Định mức (sản phẩm / tấm) khai ở từng NVL bên dưới, theo file layout của xưởng; chưa khai thì hệ thống ước tính bằng cách xếp D x R lên tấm (hiện dấu ≈).
        </p>
        <div v-if="editingKids.length" class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Đang chứa {{ editingKids.length }} SKU con:
          <span class="font-mono text-foreground">{{ editingKids.map((c) => c.code).join(', ') }}</span>
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
              <span class="flex-1 text-sm text-foreground">
                {{ m.name }} <span class="text-xs text-muted-foreground">({{ m.code }})</span>
                <span v-if="selectedMats.includes(m.id)" class="ml-1 text-xs tabular-nums text-muted-foreground">
                  <template v-if="liveQuota(m)">ước tính ≈ {{ liveQuota(m) }} sp/tấm</template>
                  <template v-else-if="m.length_mm == null">— tấm chưa khai kích thước</template>
                  <template v-else>— nhập D x R để có ước tính</template>
                </span>
              </span>
              <input
                v-if="selectedMats.includes(m.id)"
                v-model.number="quotaByMat[m.id]"
                type="number"
                min="1"
                class="input w-24 py-1 text-sm"
                :placeholder="liveQuota(m) ? `≈ ${liveQuota(m)}` : 'sp/tấm'"
                title="Định mức khai: sản phẩm / tấm NVL này, theo file layout của xưởng. Để trống = dùng ước tính theo kích thước"
              />
              <input
                v-if="selectedMats.includes(m.id)"
                v-model.number="qtyByMat[m.id]"
                type="number"
                min="1"
                class="input w-16 py-1 text-sm"
                title="SL NVL cho MỘT sản phẩm (định lượng vật tư)"
              />
            </label>
          </div>
          <p v-if="selectedMats.length" class="mt-1 text-[11px] text-muted-foreground">
            Ô rộng: <b class="text-foreground">định mức</b> — số sản phẩm một tấm NVL này làm ra, lấy từ file layout
            của xưởng; để trống thì hệ thống ước tính theo kích thước (≈). Ô hẹp: một sản phẩm ăn bao nhiêu NVL.
          </p>
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

    <!-- Import tạo cả NVL lẫn SKU nên báo riêng ('imported'), để trang cha nạp
         lại cả hai danh sách chứ không chỉ SKU. -->
    <ParentSkuImportDialog v-model="parentImportOpen" @imported="emit('imported')" />
    <SkuImportDialog v-model="importOpen" @imported="emit('imported')" />
  </div>
</template>
