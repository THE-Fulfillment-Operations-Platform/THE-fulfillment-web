<script setup lang="ts">
import { notesApi } from '~/services/api'
import type { NoteInput } from '~/services/api'
import type { Note } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { useConfirm } from '~/composables/useConfirm'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { exportCsv } from '~/utils/csv'
import { useToastStore } from '~/stores/toast'
import {
  NOTE_SEVERITY,
  NOTE_STATUS,
  NOTE_SEVERITY_OPTIONS,
  NOTE_STATUS_OPTIONS,
  ENTITY_TYPE_OPTIONS,
  ENTITY_TYPE_LABEL,
  entityTypeLabel,
  DEFECT_CODE_OPTIONS,
  reasonCodeLabel,
  ROLE_LABEL,
} from '~/utils/enums'

// Notes / Required Attention (Wireframe: Notes). Cross-cutting flags raised at any
// stage (missing art, QC defect, address issue). Ops triages severity/status and
// resolves; required_attention surfaces them on the dashboard.
const toast = useToastStore()

const filters = reactive({ status: '', severity: '', required: false, page: 1 })

const statusFilterOptions = computed(() => [
  { value: '', label: 'Tất cả' },
  ...NOTE_STATUS_OPTIONS.map((s) => ({ value: s, label: NOTE_STATUS[s].label })),
])
const severityFilterOptions = computed(() => [
  { value: '', label: 'Tất cả' },
  ...NOTE_SEVERITY_OPTIONS.map((s) => ({ value: s, label: NOTE_SEVERITY[s].label })),
])

const { data, meta, loading, error, reload } = useApiResource<Note[]>(() =>
  notesApi.list({
    status: filters.status || undefined,
    severity: filters.severity || undefined,
    required_attention: filters.required || undefined,
    page: filters.page,
    page_size: 20,
  }),
)
const notes = computed(() => data.value ?? [])

function applyFilters() {
  filters.page = 1
  reload()
}
function changePage(p: number) {
  filters.page = p
  reload()
}

function exportNotes() {
  const rows = notes.value
  if (!rows.length) {
    toast.info('Không có note nào để xuất.')
    return
  }
  exportCsv(`notes-${new Date().toISOString().slice(0, 10)}`, rows, [
    { label: 'Tiêu đề', value: 'title' },
    { label: 'Nội dung', value: (n) => n.body ?? '' },
    { label: 'Lý do', value: (n) => reasonCodeLabel(n.reason_code) },
    { label: 'Mức độ', value: (n) => NOTE_SEVERITY[n.severity]?.label ?? n.severity },
    { label: 'Trạng thái', value: (n) => NOTE_STATUS[n.status]?.label ?? n.status },
    { label: 'Cần chú ý', value: (n) => (n.is_required_attention ? 'Có' : '') },
    { label: 'Đối tượng', value: (n) => (n.entity_type ? `${entityTypeLabel(n.entity_type)}${n.entity_id ? ' #' + n.entity_id : ''}` : '') },
    { label: 'Phụ trách', value: (n) => (n.owner_role ? ROLE_LABEL[n.owner_role] : '') },
    { label: 'Tạo lúc', value: (n) => formatDateTime(n.created_at) },
  ])
  toast.success(`Đã xuất ${rows.length} note ra CSV.`)
}

// ---- Create / edit ---------------------------------------------------------
const open = ref(false)
const editing = ref<Note | null>(null)
const saving = ref(false)
const form = reactive<NoteInput>({
  title: '',
  body: '',
  reason_code: '',
  severity: 'NORMAL',
  status: 'OPEN',
  is_required_attention: false,
  entity_type: undefined,
  entity_id: undefined,
  owner_role: undefined,
  due_date: '',
})

// Select option lists for the form (mirror the enum maps / arrays used above).
const ownerRoleOptions = [
  { value: '', label: '— Không gán —' },
  ...Object.entries(ROLE_LABEL).map(([role, label]) => ({ value: role, label })),
]
const severityOptions = NOTE_SEVERITY_OPTIONS.map((s) => ({ value: s, label: NOTE_SEVERITY[s].label }))
const statusOptions = NOTE_STATUS_OPTIONS.map((s) => ({ value: s, label: NOTE_STATUS[s].label }))
const entityTypeOptions = [
  { value: '', label: '— Không gắn —' },
  ...ENTITY_TYPE_OPTIONS.map((t) => ({ value: t, label: ENTITY_TYPE_LABEL[t] })),
]

// Reason-code select mirrors the QC defect list (shows Vietnamese labels). If the
// note being edited carries a code outside that list (legacy/custom), keep it as
// its own option so saving never silently drops it.
const reasonCodeOptions = computed(() => {
  const opts = [{ value: '', label: '— Không có —' }, ...DEFECT_CODE_OPTIONS]
  const cur = form.reason_code
  if (cur && !opts.some((o) => o.value === cur)) opts.push({ value: cur, label: cur })
  return opts
})

function resetForm() {
  form.title = ''
  form.body = ''
  form.reason_code = ''
  form.severity = 'NORMAL'
  form.status = 'OPEN'
  form.is_required_attention = false
  form.entity_type = undefined
  form.entity_id = undefined
  form.owner_role = undefined
  form.due_date = ''
}

function openCreate() {
  editing.value = null
  resetForm()
  open.value = true
}

function openEdit(n: Note) {
  editing.value = n
  form.title = n.title
  form.body = n.body ?? ''
  form.reason_code = n.reason_code ?? ''
  form.severity = n.severity
  form.status = n.status
  form.is_required_attention = n.is_required_attention
  form.entity_type = n.entity_type
  form.entity_id = n.entity_id
  form.owner_role = n.owner_role
  form.due_date = n.due_date ?? ''
  open.value = true
}

async function submit() {
  if (!form.title.trim() || saving.value) return
  saving.value = true
  try {
    const payload: NoteInput = {
      title: form.title.trim(),
      body: form.body || undefined,
      reason_code: form.reason_code || undefined,
      severity: form.severity,
      status: form.status,
      is_required_attention: form.is_required_attention,
      entity_type: form.entity_type || undefined,
      entity_id: form.entity_id || undefined,
      owner_role: form.owner_role || undefined,
      due_date: form.due_date || undefined,
    }
    if (editing.value) {
      await notesApi.update(editing.value.id, payload)
      toast.success('Đã cập nhật note')
    } else {
      await notesApi.create(payload)
      toast.success('Đã tạo note')
    }
    open.value = false
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

const resolvingId = ref<number | null>(null)
async function resolve(n: Note) {
  resolvingId.value = n.id
  try {
    await notesApi.update(n.id, { status: 'RESOLVED', is_required_attention: false })
    toast.success(`Đã giải quyết: ${n.title}`)
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    resolvingId.value = null
  }
}

async function remove(n: Note) {
  if (
    !(await useConfirm().confirm({
      title: 'Xoá ghi chú',
      message: `Xoá note "${n.title}"? Thao tác không thể hoàn tác.`,
      tone: 'danger',
      confirmText: 'Xoá',
    }))
  )
    return
  try {
    await notesApi.remove(n.id)
    toast.success('Đã xoá note')
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
</script>

<template>
  <div>
    <PageHeader title="Ghi chú & Cảnh báo" subtitle="Ghi chú & cảnh báo xuyên suốt quy trình — Ops phân loại và xử lý">
      <template #actions>
        <button class="btn-secondary" :disabled="!notes.length" title="Xuất các note đang hiển thị ra CSV" @click="exportNotes">
          <UiIcon name="upload" :size="16" /> Xuất CSV
        </button>
        <button class="btn-primary" @click="openCreate"><UiIcon name="plus" :size="16" /> Tạo note</button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="card mb-4 p-4">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label class="label">Trạng thái</label>
          <UiSelect v-model="filters.status" :options="statusFilterOptions" aria-label="Trạng thái" @change="applyFilters" />
        </div>
        <div>
          <label class="label">Mức độ</label>
          <UiSelect v-model="filters.severity" :options="severityFilterOptions" aria-label="Mức độ" @change="applyFilters" />
        </div>
        <div class="flex items-end">
          <label class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2">
            <input v-model="filters.required" type="checkbox" class="h-4 w-4 rounded border-border text-primary focus:ring-ring" @change="applyFilters" />
            <span class="text-sm text-foreground">Chỉ mục cần chú ý</span>
          </label>
        </div>
        <div class="flex items-end">
          <button class="btn-secondary w-full" @click="reload"><UiIcon name="refresh" :size="16" /> Làm mới</button>
        </div>
      </div>
    </div>

    <div class="card overflow-hidden">
      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && notes.length === 0"
        empty-text="Không có note nào khớp bộ lọc."
        skeleton
        :skeleton-rows="8"
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Tiêu đề</th>
                <th class="table-th hidden md:table-cell">Đối tượng</th>
                <th class="table-th hidden lg:table-cell">Phụ trách</th>
                <th class="table-th">Mức độ</th>
                <th class="table-th">Trạng thái</th>
                <th class="table-th hidden sm:table-cell">Tạo lúc</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="n in notes" :key="n.id" class="hover:bg-muted">
                <td class="table-td max-w-xs">
                  <div class="flex items-center gap-1.5">
                    <UiIcon v-if="n.is_required_attention" name="alert" :size="14" class="shrink-0 text-red-500 dark:text-rose-400" />
                    <span class="truncate font-medium text-foreground">{{ n.title }}</span>
                  </div>
                  <p v-if="n.reason_code" class="text-xs text-muted-foreground">{{ reasonCodeLabel(n.reason_code) }}</p>
                </td>
                <td class="table-td hidden text-xs text-muted-foreground md:table-cell">
                  <span v-if="n.entity_type">{{ entityTypeLabel(n.entity_type) }} #{{ n.entity_id }}</span>
                  <span v-else>—</span>
                </td>
                <td class="table-td hidden text-xs text-muted-foreground lg:table-cell">{{ n.owner_role ? ROLE_LABEL[n.owner_role] : '—' }}</td>
                <td class="table-td"><UiStatusBadge kind="severity" :value="n.severity" /></td>
                <td class="table-td"><UiStatusBadge kind="noteStatus" :value="n.status" /></td>
                <td class="table-td hidden text-xs text-muted-foreground sm:table-cell">{{ formatDateTime(n.created_at) }}</td>
                <td class="table-td">
                  <div class="flex items-center justify-end gap-1">
                    <button
                      v-if="n.status !== 'RESOLVED'"
                      class="table-action text-emerald-600 disabled:opacity-50 dark:text-emerald-400"
                      :disabled="resolvingId === n.id"
                      @click="resolve(n)"
                    >
                      Giải quyết
                    </button>
                    <button class="table-action text-primary" @click="openEdit(n)">Sửa</button>
                    <button class="table-action text-red-500 dark:text-rose-400" @click="remove(n)">Xoá</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="px-4">
          <UiPagination :meta="meta" @change="changePage" />
        </div>
      </UiStateBlock>
    </div>

    <!-- Create / edit modal -->
    <UiModal v-model="open" :title="editing ? 'Sửa note' : 'Tạo note'" wide>
      <div class="space-y-4">
        <div>
          <label class="label">Tiêu đề *</label>
          <input v-model="form.title" class="input" placeholder="VD: Thiếu mockup item ACR-05" />
        </div>
        <div>
          <label class="label">Nội dung</label>
          <textarea v-model="form.body" rows="3" class="input" placeholder="Mô tả chi tiết…" />
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Loại lỗi / lý do</label>
            <UiSelect v-model="form.reason_code" :options="reasonCodeOptions" aria-label="Loại lỗi / lý do" placeholder="— Không có —" />
          </div>
          <div>
            <label class="label">Phụ trách (role)</label>
            <UiSelect v-model="form.owner_role" :options="ownerRoleOptions" aria-label="Phụ trách (role)" placeholder="— Không gán —" />
          </div>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Mức độ</label>
            <UiSelect v-model="form.severity" :options="severityOptions" aria-label="Mức độ" />
          </div>
          <div>
            <label class="label">Trạng thái</label>
            <UiSelect v-model="form.status" :options="statusOptions" aria-label="Trạng thái" />
          </div>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Loại đối tượng</label>
            <UiSelect v-model="form.entity_type" :options="entityTypeOptions" aria-label="Loại đối tượng" placeholder="— Không gắn —" />
          </div>
          <div>
            <label class="label">ID đối tượng</label>
            <input v-model.number="form.entity_id" type="number" class="input" placeholder="VD: 4" />
          </div>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Hạn xử lý</label>
            <input v-model="form.due_date" type="date" class="input" />
          </div>
          <div class="flex items-end">
            <label class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2">
              <input v-model="form.is_required_attention" type="checkbox" class="h-4 w-4 rounded border-border text-primary focus:ring-ring" />
              <span class="text-sm text-foreground">Cần chú ý (nổi lên dashboard)</span>
            </label>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="open = false">Huỷ</button>
        <button class="btn-primary" :disabled="!form.title.trim() || saving" @click="submit">
          <UiSpinner v-if="saving" :size="16" /> {{ editing ? 'Lưu' : 'Tạo note' }}
        </button>
      </template>
    </UiModal>
  </div>
</template>
