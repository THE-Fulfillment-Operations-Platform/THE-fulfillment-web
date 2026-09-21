<script setup lang="ts">
import {
  analyze,
  buildGeometry,
  topEdgeAt,
  DEFAULT_SETTINGS,
  WORK_MAX_EDGE,
  type Analysis,
  type DiecutGeometry,
  type DiecutSettings,
} from '~/utils/diecut/pipeline'
import { loadSource, workingImage, type LoadedSource } from '~/utils/diecut/source'
import { buildZip, downloadBlob, buildFiles, bytesToBlob, safeName } from '~/utils/diecut/package'
import { canvasToBytes, renderPrintCanvas } from '~/utils/diecut/render'
import { buildCutSvg } from '~/utils/diecut/svg'
import { useToastStore } from '~/stores/toast'

// Công cụ Thiết kế: up ảnh sản phẩm → ra bộ file in + file cắt gửi xưởng.
//
// Chạy TRỌN VẸN trong trình duyệt. Không có API, không lưu gì lên máy chủ: ảnh
// thiết kế là tài sản của seller, và một công cụ không gửi ảnh đi đâu thì không
// bao giờ làm lộ ảnh. Đổi lại, máy yếu xử lý ảnh khổng lồ sẽ chậm — nên mọi phép
// dò biên chạy trên bản thu nhỏ, chỉ file in mới dựng ở độ phân giải thật.
const toast = useToastStore()

interface Item {
  id: string
  fileName: string
  status: 'loading' | 'ready' | 'error'
  error: string
  source: LoadedSource | null
  analysis: Analysis | null
  geometry: DiecutGeometry | null
  settings: DiecutSettings
  hasAlpha: boolean
  thumb: string
}

const items = ref<Item[]>([])
const activeId = ref('')
const busy = ref(false)
const showPrint = ref(true)
const showCut = ref(true)
const exporting = ref(false)

const active = computed(() => items.value.find((i) => i.id === activeId.value) ?? null)
const ready = computed(() => items.value.filter((i) => i.status === 'ready' && i.geometry))

function newId() {
  return Math.random().toString(36).slice(2, 10)
}

/** Ảnh có vùng trong suốt không — quyết định chọn sẵn cách tách nền nào. */
function detectAlpha(canvas: HTMLCanvasElement): boolean {
  const w = Math.min(canvas.width, 400)
  const h = Math.min(canvas.height, 400)
  const probe = document.createElement('canvas')
  probe.width = w
  probe.height = h
  const ctx = probe.getContext('2d')!
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  let clear = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] < 8) clear++
  // Vài điểm trong suốt lẻ tẻ có thể do nén; phải có mảng nền thật sự mới tính.
  return clear > (w * h) / 50
}

function thumbOf(canvas: HTMLCanvasElement): string {
  const max = 96
  const scale = Math.min(1, max / Math.max(canvas.width, canvas.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(canvas.width * scale))
  c.height = Math.max(1, Math.round(canvas.height * scale))
  c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

async function addFiles(files: File[]) {
  for (const file of files) {
    items.value.push({
      id: newId(),
      fileName: file.name,
      status: 'loading',
      error: '',
      source: null,
      analysis: null,
      geometry: null,
      settings: { ...DEFAULT_SETTINGS, hole: { ...DEFAULT_SETTINGS.hole } },
      hasAlpha: false,
      thumb: '',
    })
    // Phải lấy lại phần tử VỪA đẩy vào mảng, không dùng object gốc: ref() bọc
    // mảng thành proxy, sửa trên object gốc thì dữ liệu có đổi nhưng giao diện
    // không biết mà vẽ lại — bảng thông số sẽ đứng im ở số cũ.
    const item = items.value[items.value.length - 1]
    if (!activeId.value) activeId.value = item.id

    try {
      const src = await loadSource(file)
      item.source = src
      item.hasAlpha = detectAlpha(src.canvas)
      item.thumb = thumbOf(src.canvas)
      item.settings.mode = item.hasAlpha ? 'alpha' : 'flood'
      await recompute(item, { full: true, autoSize: true })
      item.status = item.geometry ? 'ready' : 'error'
      if (!item.geometry) {
        item.error =
          'Không tìm thấy hình nào trong file. Thử đổi cách tách nền hoặc tăng dung sai màu nền.'
      }
    } catch (e) {
      item.status = 'error'
      item.error = e instanceof Error ? e.message : String(e)
    }
  }
}

/**
 * Tính lại. `full` = tách nền lại (nặng), ngược lại chỉ dò đường cắt ở mức viền
 * mới (nhẹ) — nhờ vậy kéo thanh "viền cắt" là thấy đổi ngay.
 */
async function recompute(item: Item, opts: { full?: boolean; autoSize?: boolean } = {}) {
  if (!item.source) return
  busy.value = true
  // Nhả một nhịp cho trình duyệt vẽ trạng thái "đang tính" trước khi chiếm CPU.
  await new Promise((r) => setTimeout(r, 0))
  try {
    if (opts.full || !item.analysis) {
      const { image, scale } = workingImage(item.source.canvas, WORK_MAX_EDGE)
      item.analysis = analyze(image, item.settings, scale)
    }
    if (!item.analysis) {
      item.geometry = null
      return
    }
    if (opts.autoSize) {
      const bboxW = item.analysis.bbox.x1 - item.analysis.bbox.x0 + 1
      const bboxH = item.analysis.bbox.y1 - item.analysis.bbox.y0 + 1
      if (item.source.mmPerPx) {
        // PDF/AI biết khổ thật của trang → lấy luôn, khỏi bắt người dùng gõ lại.
        item.settings.artworkWidthMm =
          Math.round(bboxW * (item.source.mmPerPx / (item.analysis.workScale || 1)) * 10) / 10
      } else {
        // Ảnh bitmap không mang kích thước thật: mặc định cạnh dài 100 mm, một
        // con số tròn để người dùng sửa, chứ không phải đoán bừa rồi im lặng.
        const long = Math.max(bboxW, bboxH)
        item.settings.artworkWidthMm = Math.round((100 * bboxW) / long)
      }
    }
    item.geometry = buildGeometry(item.analysis, item.settings)
  } finally {
    busy.value = false
  }
}

// Đổi thông số → tính lại. Chỉ những thông số đụng tới việc tách nền mới bắt
// phải phân tích lại từ đầu.
const MASK_KEYS = ['mode', 'alphaThreshold', 'floodTolerance', 'despeckleMm2', 'fillHolesMm2'] as const
let pending: ReturnType<typeof setTimeout> | null = null
function onSettings(next: DiecutSettings) {
  const item = active.value
  if (!item) return
  const prev = item.settings
  const full = MASK_KEYS.some((k) => prev[k] !== next[k])
  item.settings = next
  if (pending) clearTimeout(pending)
  // Gom nhịp kéo thanh trượt lại: kéo 30 nấc thì tính một lần, không phải 30 lần.
  pending = setTimeout(() => recompute(item, { full }), full ? 220 : 90)
}

function applyToAll() {
  const item = active.value
  if (!item) return
  for (const other of items.value) {
    if (other.id === item.id || other.status === 'error') continue
    other.settings = { ...item.settings, hole: { ...item.settings.hole } }
    recompute(other, { full: true })
  }
  toast.success(`Đã áp thông số cho ${items.value.length - 1} file còn lại.`)
}

function placeHole({ xMm, yMm }: { xMm: number; yMm: number }) {
  const item = active.value
  if (!item?.geometry) return
  const g = item.geometry
  const r = item.settings.hole.diameterMm / 2
  const xRatio = Math.min(1, Math.max(0, xMm / g.widthMm))
  const top = topEdgeAt(g.rings, xRatio * g.widthMm) ?? 0
  const margin = Math.max(0.5, Math.round((yMm - top - r) * 10) / 10)
  onSettings({ ...item.settings, hole: { ...item.settings.hole, xRatio, marginMm: margin } })
}

function removeItem(id: string) {
  const idx = items.value.findIndex((i) => i.id === id)
  if (idx < 0) return
  items.value.splice(idx, 1)
  if (activeId.value === id) activeId.value = items.value[0]?.id ?? ''
}

function jobOf(item: Item) {
  return {
    name: item.fileName,
    source: item.source!.canvas,
    analysis: item.analysis!,
    geometry: item.geometry!,
    settings: item.settings,
  }
}

async function exportAll() {
  if (!ready.value.length) return
  exporting.value = true
  try {
    const blob = await buildZip(ready.value.map(jobOf))
    const stamp = new Date().toISOString().slice(0, 10)
    const name =
      ready.value.length === 1
        ? `${safeName(ready.value[0].fileName)}_IN-CAT.zip`
        : `file-in-cat-${stamp}.zip`
    downloadBlob(blob, name)
    toast.success(`Đã xuất ${ready.value.length} bộ file.`)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Không xuất được file.')
  } finally {
    exporting.value = false
  }
}

async function exportOne(kind: 'print' | 'dxf' | 'svg') {
  const item = active.value
  if (!item?.geometry || !item.analysis || !item.source) return
  exporting.value = true
  try {
    const base = safeName(item.fileName)
    if (kind === 'print') {
      const canvas = renderPrintCanvas(item.source.canvas, item.analysis, item.geometry, item.settings)
      downloadBlob(bytesToBlob(await canvasToBytes(canvas), 'image/png'), `${base}_IN.png`)
    } else if (kind === 'svg') {
      const svg = buildCutSvg({
        rings: item.geometry.rings,
        hole: item.geometry.hole ?? undefined,
        widthMm: item.geometry.widthMm,
        heightMm: item.geometry.heightMm,
        title: base,
      })
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${base}_CAT.svg`)
    } else {
      const files = await buildFiles(jobOf(item))
      const dxf = files.find((f) => f.path.endsWith('.dxf'))!
      downloadBlob(bytesToBlob(dxf.bytes, 'application/dxf'), dxf.path)
    }
  } finally {
    exporting.value = false
  }
}

const artworkHeightMm = computed(() => active.value?.geometry?.artwork.heightMm ?? 0)
const knownSizeMm = computed(() => {
  const item = active.value
  if (!item?.source?.mmPerPx || !item.analysis) return null
  const bboxW = item.analysis.bbox.x1 - item.analysis.bbox.x0 + 1
  return bboxW * (item.source.mmPerPx / (item.analysis.workScale || 1))
})
</script>

<template>
  <div>
    <PageHeader
      title="Thiết kế — File in & file cắt"
      subtitle="Up ảnh sản phẩm, công cụ tách hình, dựng đường cắt theo viền rồi xuất bộ file in + cắt gửi xưởng"
    >
      <template #actions>
        <button class="btn-primary" :disabled="!ready.length || exporting" @click="exportAll">
          <UiSpinner v-if="exporting" :size="15" />
          <UiIcon v-else name="download" :size="16" />
          Tải bộ file ({{ ready.length || 0 }})
        </button>
      </template>
    </PageHeader>

    <DiecutDropzone v-if="!items.length" @files="addFiles" />

    <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      <!-- Cột trái: danh sách file + khung xem trước -->
      <div class="flex min-w-0 flex-col gap-3">
        <!-- Băng file khi làm nhiều sản phẩm một lượt -->
        <div class="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            v-for="it in items"
            :key="it.id"
            class="group relative flex shrink-0 items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors"
            :class="
              it.id === activeId
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card hover:bg-muted'
            "
            @click="activeId = it.id"
          >
            <img v-if="it.thumb" :src="it.thumb" alt="" class="h-9 w-9 rounded object-contain" />
            <div v-else class="flex h-9 w-9 items-center justify-center rounded bg-muted">
              <UiSpinner v-if="it.status === 'loading'" :size="14" />
              <UiIcon v-else name="alert" :size="14" />
            </div>
            <div class="max-w-[9rem]">
              <p class="truncate text-xs font-medium text-foreground">{{ it.fileName }}</p>
              <p class="text-[11px] text-muted-foreground">
                <span v-if="it.status === 'loading'">đang đọc…</span>
                <span v-else-if="it.status === 'error'" class="text-destructive">lỗi</span>
                <span v-else-if="it.geometry" class="tabular-nums">
                  {{ it.geometry.widthMm.toFixed(0) }}×{{ it.geometry.heightMm.toFixed(0) }} mm
                </span>
              </p>
            </div>
            <span
              class="ml-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
              role="button"
              aria-label="Bỏ file"
              @click.stop="removeItem(it.id)"
            >
              <UiIcon name="close" :size="13" />
            </span>
          </button>
          <DiecutDropzone compact class="shrink-0" @files="addFiles" />
        </div>

        <!-- Khung xem trước -->
        <!-- Khung xem trước chiếm gần hết chiều cao màn hình: đây là chỗ người ta
             nhìn để quyết, không phải bảng thông số. -->
        <div class="card flex min-h-[26rem] flex-col p-3 lg:h-[calc(100vh-13rem)]">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-1 rounded-lg bg-muted p-1">
              <button
                class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                :class="showPrint ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'"
                @click="showPrint = !showPrint"
              >
                Hình in
              </button>
              <button
                class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                :class="showCut ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'"
                @click="showCut = !showCut"
              >
                Đường cắt
              </button>
            </div>
            <div v-if="active?.geometry" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span class="tabular-nums">
                Thành phẩm
                <b class="text-foreground">{{ active.geometry.widthMm.toFixed(1) }} × {{ active.geometry.heightMm.toFixed(1) }} mm</b>
              </span>
              <span class="tabular-nums">In {{ Math.round(active.geometry.stats.dpi) }} DPI</span>
              <span class="tabular-nums">{{ active.geometry.stats.ringCount }} đường · {{ active.geometry.stats.pointCount }} điểm</span>
            </div>
          </div>

          <div v-if="active?.status === 'error'" class="flex flex-1 items-center justify-center p-6 text-center">
            <div>
              <UiIcon name="alert" :size="28" class="mx-auto mb-2 text-destructive" />
              <p class="text-sm font-medium text-foreground">Không xử lý được file này</p>
              <p class="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{{ active.error }}</p>
            </div>
          </div>
          <DiecutPreview
            v-else
            class="min-h-[22rem] flex-1"
            :source="active?.source?.canvas ?? null"
            :analysis="active?.analysis ?? null"
            :geometry="active?.geometry ?? null"
            :settings="active?.settings ?? DEFAULT_SETTINGS"
            :show-print="showPrint"
            :show-cut="showCut"
            :busy="busy"
            @place-hole="placeHole"
          />
        </div>

        <!-- Cảnh báo chất lượng: nói trước khi file đi ra xưởng, không phải sau -->
        <div v-if="active?.geometry?.warnings.length" class="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
          <p class="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
            <UiIcon name="alert" :size="14" /> Cần xem lại trước khi gửi xưởng
          </p>
          <ul class="ml-5 list-disc space-y-0.5 text-xs text-amber-800 dark:text-amber-200">
            <li v-for="(w, i) in active.geometry.warnings" :key="i">{{ w }}</li>
          </ul>
        </div>
        <p v-if="active?.geometry?.notes.length" class="text-[11px] text-muted-foreground">
          {{ active.geometry.notes.join(' · ') }}
        </p>
      </div>

      <!-- Cột phải: thông số + xuất file -->
      <div class="lg:sticky lg:top-4 lg:self-start">
        <div class="card p-4">
          <DiecutSettings
            v-if="active && active.status !== 'error'"
            :model-value="active.settings"
            :artwork-height-mm="artworkHeightMm"
            :has-alpha="active.hasAlpha"
            :known-size-mm="knownSizeMm"
            :multi="items.length > 1"
            @update:model-value="onSettings"
            @apply-all="applyToAll"
          />
          <div class="mt-5 space-y-2 border-t border-border pt-4">
            <button class="btn-primary w-full" :disabled="!ready.length || exporting" @click="exportAll">
              <UiSpinner v-if="exporting" :size="15" />
              <UiIcon v-else name="download" :size="16" />
              Tải bộ file ({{ ready.length }} sản phẩm)
            </button>
            <div class="flex gap-2">
              <button class="btn-secondary flex-1 text-xs" :disabled="!active?.geometry || exporting" @click="exportOne('print')">
                File in
              </button>
              <button class="btn-secondary flex-1 text-xs" :disabled="!active?.geometry || exporting" @click="exportOne('dxf')">
                DXF
              </button>
              <button class="btn-secondary flex-1 text-xs" :disabled="!active?.geometry || exporting" @click="exportOne('svg')">
                SVG
              </button>
            </div>
            <p class="text-[11px] leading-snug text-muted-foreground">
              Bộ file gồm PNG in, DXF R12 và SVG đường cắt, ảnh xem trước và file thông số. File in
              và file cắt chung gốc toạ độ nên chồng lên nhau là khớp.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
