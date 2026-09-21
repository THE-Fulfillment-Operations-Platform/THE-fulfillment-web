<script setup lang="ts">
import type { Analysis, DiecutGeometry, DiecutSettings } from '~/utils/diecut/pipeline'
import { drawPreview, previewMarginMm, renderPrintCanvas } from '~/utils/diecut/render'

// Khung xem trước: file in và đường cắt chồng đúng vị trí thật. Vẽ bằng chính
// hàm dựng ảnh xem trước của gói file, nên cái nhìn trên màn hình đúng bằng cái
// nằm trong ZIP — không có chuyện "trên máy thấy khác, xưởng mở ra khác".
const props = defineProps<{
  source: HTMLCanvasElement | null
  analysis: Analysis | null
  geometry: DiecutGeometry | null
  settings: DiecutSettings
  showPrint: boolean
  showCut: boolean
  busy: boolean
}>()
const emit = defineEmits<{ (e: 'place-hole', payload: { xMm: number; yMm: number }): void }>()

const box = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const pxPerMm = ref(1)
const margin = ref(0)

function render() {
  const g = props.geometry
  const cv = canvas.value
  const host = box.value
  if (!cv || !host) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  if (!g) {
    cv.width = 0
    cv.height = 0
    return
  }

  // Vừa khung, chừa lề cho nhãn kích thước. Lề quanh khổ cắt tính luôn vào đây,
  // nếu không thì đường cắt nằm đúng trên mép canvas và bị viền khung che nửa nét.
  const marginMm = previewMarginMm(g)
  const boxW = g.widthMm + marginMm * 2
  const boxH = g.heightMm + marginMm * 2
  const availW = Math.max(120, host.clientWidth - 24)
  const availH = Math.max(120, host.clientHeight - 24)
  const fit = Math.min(availW / boxW, availH / boxH)
  pxPerMm.value = Math.max(0.2, fit)
  margin.value = marginMm

  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cssW = boxW * pxPerMm.value
  const cssH = boxH * pxPerMm.value
  cv.style.width = `${cssW}px`
  cv.style.height = `${cssH}px`
  cv.width = Math.max(1, Math.round(cssW * dpr))
  cv.height = Math.max(1, Math.round(cssH * dpr))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // File in dựng ở đúng độ phân giải màn hình đang cần — không dựng bản 300 DPI
  // chỉ để thu nhỏ lại, vì mỗi lần kéo thanh trượt là một lần dựng.
  let print: HTMLCanvasElement | null = null
  if (props.showPrint && props.source && props.analysis) {
    const screenDpi = Math.min(200, Math.max(40, pxPerMm.value * 25.4 * dpr))
    print = renderPrintCanvas(props.source, props.analysis, g, { ...props.settings, printDpi: screenDpi })
  }
  drawPreview(ctx, print, g, pxPerMm.value, {
    checkerboard: true,
    showCut: props.showCut,
    showPrint: props.showPrint,
    marginMm,
  })
}

let frame = 0
function scheduleRender() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(render)
}

function onClick(e: MouseEvent) {
  const g = props.geometry
  const cv = canvas.value
  if (!g || !cv) return
  // Trừ lề để bấm vào đâu là lỗ nằm đúng đó, không lệch đi một lề.
  const rect = cv.getBoundingClientRect()
  const boxW = g.widthMm + margin.value * 2
  const boxH = g.heightMm + margin.value * 2
  emit('place-hole', {
    xMm: ((e.clientX - rect.left) / rect.width) * boxW - margin.value,
    yMm: ((e.clientY - rect.top) / rect.height) * boxH - margin.value,
  })
}

let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(scheduleRender)
  if (box.value) ro.observe(box.value)
  scheduleRender()
})
onBeforeUnmount(() => {
  ro?.disconnect()
  cancelAnimationFrame(frame)
})
watch(
  () => [props.geometry, props.settings, props.showPrint, props.showCut, props.source],
  scheduleRender,
  { deep: true },
)
</script>

<template>
  <div class="relative flex h-full flex-col">
    <!-- Nhãn khổ ngang -->
    <div class="flex items-center justify-center pb-1 text-[11px] font-medium tabular-nums text-muted-foreground">
      <span v-if="props.geometry">{{ props.geometry.widthMm.toFixed(1) }} mm</span>
    </div>
    <div class="flex min-h-0 flex-1 items-stretch gap-1">
      <!-- Nhãn khổ dọc -->
      <div class="flex w-5 items-center justify-center">
        <span
          v-if="props.geometry"
          class="whitespace-nowrap text-[11px] font-medium tabular-nums text-muted-foreground"
          style="writing-mode: vertical-rl; transform: rotate(180deg)"
        >
          {{ props.geometry.heightMm.toFixed(1) }} mm
        </span>
      </div>
      <div ref="box" class="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40 p-3">
        <canvas
          ref="canvas"
          class="max-h-full max-w-full cursor-crosshair rounded shadow-sm"
          title="Bấm để thêm một lỗ khoan tại đây"
          @click="onClick"
        />
      </div>
    </div>
    <div
      v-if="props.busy"
      class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background/50"
    >
      <span class="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-medium shadow">
        <UiSpinner :size="14" /> Đang tính đường cắt…
      </span>
    </div>
  </div>
</template>
