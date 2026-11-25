<script setup lang="ts">
// Bảng "loại hàng → dịch vụ THE" (#7783, Nghĩa 25/11/2026): thiệp đi Postcard US,
// mica và gỗ đi Standard Plus US. "Tạo label THE" tự chọn dịch vụ cho từng đơn
// theo NVL của SKU (không khớp NVL thì theo mã HS). Đơn trộn nhiều loại dùng
// dịch vụ của loại đứng TRÊN CÙNG trong bảng.
//
// v-model là bảng đã chuẩn hoá để gửi lên máy chủ; ô từ khoá sửa dạng chữ
// "A, B, C" ở bản sao cục bộ rồi mới đổi thành mảng.
import { carrierApi } from '~/services/api'
import type { THEServiceRules, THERulesPreview } from '~/services/api'
import { errorMessage } from '~/utils/api-error'

const props = defineProps<{
  modelValue: THEServiceRules
  /** Dịch vụ mặc định của kết nối (ô "Dịch vụ mặc định" phía trên). */
  defaultService: string
  /** Danh sách dịch vụ lấy từ THE (sau "Kiểm tra kết nối"). */
  services: Array<{ code: string; name: string }>
  /** false = chưa ai lưu bảng, đang dùng bảng mặc định. */
  saved: boolean
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: THEServiceRules): void
  (e: 'reset'): void
}>()

interface Row {
  key: number
  name: string
  service_code: string
  service_name: string
  materials: string
  hs: string
}

let nextKey = 0
const auto = ref(true)
const unclassified = ref<'default' | 'block'>('default')
const rows = ref<Row[]>([])

const splitList = (s: string) =>
  s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)

function toRules(): THEServiceRules {
  return {
    auto: auto.value,
    unclassified: unclassified.value,
    groups: rows.value.map((r) => ({
      name: r.name.trim(),
      service_code: r.service_code,
      service_name: r.service_code ? r.service_name : '',
      materials: splitList(r.materials),
      hs_prefixes: splitList(r.hs),
    })),
  }
}

function load(r: THEServiceRules) {
  auto.value = r.auto
  unclassified.value = r.unclassified === 'block' ? 'block' : 'default'
  rows.value = (r.groups ?? []).map((g) => ({
    key: ++nextKey,
    name: g.name,
    service_code: g.service_code,
    service_name: g.service_name ?? '',
    materials: (g.materials ?? []).join(', '),
    hs: (g.hs_prefixes ?? []).join(', '),
  }))
}

// Nạp lại khi cha đổi giá trị từ ngoài (tải trang, lưu xong, về mặc định) —
// bỏ qua khi đó chính là bản mình vừa phát ra, để khỏi xoá chữ đang gõ dở.
watch(
  () => props.modelValue,
  (v) => {
    if (v && JSON.stringify(v) !== JSON.stringify(toRules())) load(v)
  },
  { immediate: true, deep: true },
)
watch([auto, unclassified, rows], () => emit('update:modelValue', toRules()), { deep: true })

const serviceOptions = computed(() => {
  const opts = [{ value: '', label: `Dịch vụ mặc định${props.defaultService ? ` (${props.defaultService})` : ''}` }]
  const seen = new Set<string>([''])
  const add = (code: string, name: string) => {
    if (!code || seen.has(code)) return
    seen.add(code)
    opts.push({ value: code, label: name && name !== code ? `${name} (${code})` : code })
  }
  for (const s of props.services) add(s.code, s.name)
  for (const r of rows.value) add(r.service_code, r.service_name)
  return opts
})

function pickService(row: Row, code: string | number) {
  row.service_code = String(code)
  row.service_name = props.services.find((s) => s.code === row.service_code)?.name ?? (row.service_code ? row.service_name : '')
}

function addRow() {
  rows.value.push({ key: ++nextKey, name: '', service_code: '', service_name: '', materials: '', hs: '' })
}
function removeRow(i: number) {
  rows.value.splice(i, 1)
}
function move(i: number, d: -1 | 1) {
  const j = i + d
  if (j < 0 || j >= rows.value.length) return
  const list = rows.value.slice()
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  rows.value = list
}

// ---- Xem trước: NVL / SKU nào rơi vào loại nào (chỉ đọc, chưa lưu) ----------
const preview = ref<THERulesPreview | null>(null)
const previewError = ref('')
const previewing = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

async function runPreview() {
  const my = ++seq
  previewing.value = true
  try {
    const rules = toRules()
    // Xem trước luôn tính như đang bật tự chọn, để thấy bảng sẽ chia thế nào.
    const { data } = await carrierApi.previewRules({ ...rules, auto: true }, props.defaultService)
    if (my !== seq) return
    preview.value = data
    previewError.value = ''
  } catch (e) {
    if (my !== seq) return
    previewError.value = errorMessage(e)
  } finally {
    if (my === seq) previewing.value = false
  }
}
watch([rows, unclassified, () => props.defaultService], () => {
  clearTimeout(timer)
  timer = setTimeout(runPreview, 500)
}, { deep: true })
onMounted(runPreview)
onBeforeUnmount(() => clearTimeout(timer))

function groupPreview(i: number) {
  return preview.value?.groups[i]
}
function materialsOf(name: string) {
  return (preview.value?.materials ?? []).filter((m) => m.group && m.group === name.trim())
}
const unclassifiedMaterials = computed(() => (preview.value?.materials ?? []).filter((m) => !m.group && m.skus > 0))
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label class="flex items-center gap-2 text-sm font-medium text-foreground">
        <input v-model="auto" type="checkbox" class="h-4 w-4 rounded border-border" />
        Tự chọn dịch vụ theo loại hàng
      </label>
      <span v-if="!saved" class="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">đang dùng bảng mặc định</span>
      <span class="flex-1" />
      <button v-if="saved" type="button" class="table-action text-muted-foreground" @click="emit('reset')">Về bảng mặc định</button>
    </div>
    <p class="text-xs text-muted-foreground">
      Mỗi SKU được xếp loại theo <b class="text-foreground">NVL</b> của nó (không có NVL thì theo NVL của SKU cha); NVL không khớp dòng nào
      thì xét <b class="text-foreground">mã HS</b>. Đơn có nhiều loại hàng dùng dịch vụ của loại đứng <b class="text-foreground">trên cùng</b> —
      mặc định có mica hoặc gỗ là đi Standard Plus US, chỉ toàn thiệp mới đi Postcard US.
      <template v-if="!auto"> <b class="text-amber-700 dark:text-amber-300">Đang tắt: mọi đơn dùng dịch vụ mặc định {{ defaultService || '—' }}.</b></template>
    </p>

    <!-- Mỗi loại hàng một khối (thẻ Cài đặt hẹp, bảng ngang sẽ bóp cột NVL). -->
    <ol class="space-y-2" :class="{ 'opacity-60': !auto }">
      <li v-for="(r, i) in rows" :key="r.key" class="rounded-md border border-border p-2.5">
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex shrink-0 items-center gap-0.5" :title="`Ưu tiên ${i + 1}: đơn trộn nhiều loại dùng dịch vụ của loại đứng trên`">
            <span class="w-4 text-center text-xs font-semibold tabular-nums text-muted-foreground">{{ i + 1 }}</span>
            <button type="button" class="rounded px-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30" :disabled="i === 0" :aria-label="`Đưa ${r.name || 'dòng ' + (i + 1)} lên`" @click="move(i, -1)">↑</button>
            <button type="button" class="rounded px-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30" :disabled="i === rows.length - 1" :aria-label="`Đưa ${r.name || 'dòng ' + (i + 1)} xuống`" @click="move(i, 1)">↓</button>
          </div>
          <input v-model="r.name" class="input w-28 shrink-0 py-1 text-sm font-medium" placeholder="Loại hàng" :aria-label="`Tên loại hàng dòng ${i + 1}`" />
          <span class="hidden shrink-0 text-xs text-muted-foreground sm:inline">→</span>
          <div class="min-w-[200px] flex-1">
            <UiSelect
              :model-value="r.service_code"
              :options="serviceOptions"
              :aria-label="`Dịch vụ THE cho ${r.name || 'dòng ' + (i + 1)}`"
              @update:model-value="(v) => pickService(r, v)"
            />
          </div>
          <button type="button" class="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-600" :aria-label="`Xoá loại ${r.name || 'dòng ' + (i + 1)}`" @click="removeRow(i)">
            <UiIcon name="trash" :size="14" />
          </button>
        </div>
        <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label class="block sm:col-span-2">
            <span class="text-[11px] text-muted-foreground">NVL có chữ (cách nhau dấu phẩy)</span>
            <input v-model="r.materials" class="input mt-0.5 py-1 font-mono text-xs" placeholder="MICA, ACRYLIC" />
          </label>
          <label class="block">
            <span class="text-[11px] text-muted-foreground">hoặc mã HS bắt đầu bằng</span>
            <input v-model="r.hs" class="input mt-0.5 py-1 font-mono text-xs" placeholder="3926" />
          </label>
        </div>
        <p class="mt-1.5 text-[11px] text-muted-foreground">
          <template v-if="groupPreview(i)">
            <b class="text-foreground">{{ groupPreview(i)!.skus }} SKU</b><template v-if="groupPreview(i)!.by_hs"> ({{ groupPreview(i)!.by_hs }} nhận theo mã HS)</template><template v-if="materialsOf(r.name).length">
              · {{ materialsOf(r.name).map((m) => `${m.name} (${m.skus})`).join(', ') }}</template>
          </template>
          <template v-else-if="previewing">Đang đếm…</template>
        </p>
      </li>
      <li class="rounded-md border border-dashed border-border bg-muted/40 p-2.5">
        <div class="flex flex-wrap items-center gap-2">
          <span class="hidden w-[58px] shrink-0 text-center text-xs text-muted-foreground sm:inline">—</span>
          <span class="w-28 shrink-0 pl-1 text-sm font-medium text-foreground">Chưa xếp loại</span>
          <span class="hidden shrink-0 text-xs text-muted-foreground sm:inline">→</span>
          <div class="min-w-[200px] flex-1">
            <UiSelect
              v-model="unclassified"
              :options="[
                { value: 'default', label: `Dịch vụ mặc định${defaultService ? ` (${defaultService})` : ''}` },
                { value: 'block', label: 'Chặn, không tạo label' },
              ]"
              aria-label="Hàng chưa xếp loại"
            />
          </div>
          <span class="hidden w-[22px] shrink-0 sm:inline" />
        </div>
        <p class="mt-1.5 text-[11px] text-muted-foreground">
          <template v-if="preview">
            <b class="text-foreground">{{ preview.unclassified.skus }} SKU</b><template v-if="unclassifiedMaterials.length">
              · {{ unclassifiedMaterials.map((m) => `${m.name} (${m.skus})`).join(', ') }}</template><template v-else-if="preview.unclassified.examples?.length">
              · {{ preview.unclassified.examples.join(', ') }}</template>
          </template>
          <template v-else-if="previewing">Đang đếm…</template>
        </p>
      </li>
    </ol>
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="btn-secondary px-3 py-1.5 text-xs" @click="addRow">
        <UiIcon name="plus" :size="13" /> Thêm loại hàng
      </button>
      <span v-if="preview" class="text-[11px] text-muted-foreground">Tổng {{ preview.skus }} SKU (không tính SKU cha) · số trên tính theo bảng đang sửa, chưa lưu</span>
      <span v-if="previewError" class="text-[11px] text-rose-700 dark:text-rose-300">{{ previewError }}</span>
    </div>
    <p v-if="unclassified === 'default'" class="text-[11px] text-muted-foreground">
      Hàng chưa xếp loại đi dịch vụ mặc định; nếu mã HS của hàng đó chưa được THE mở cho tài khoản, THE giữ đơn ở trạng thái chờ cho nhân viên THE xử lý (chưa trừ tiền).
    </p>
  </div>
</template>
