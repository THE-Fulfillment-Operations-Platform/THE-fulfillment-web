<script setup lang="ts">
import type { DiecutGeometry, DiecutSettings } from '~/utils/diecut/pipeline'

// Bảng thông số. Xếp theo đúng thứ tự người ta nghĩ khi làm file:
//   tách hình → đặt kích thước thật → vẽ đường cắt → khoan lỗ treo → chất lượng in.
const props = defineProps<{
  modelValue: DiecutSettings
  /** Tỷ lệ cao/ngang của ảnh gốc — dùng khi khoá tỷ lệ. */
  naturalRatio: number
  /** Lệch bao nhiêu % so với tỷ lệ gốc (dương = kéo cao). */
  stretchPct: number
  hasAlpha: boolean
  knownSizeMm: number | null
  multi: boolean
  /** Lỗ đã quy ra mm, kèm khoảng hở đo được — để liệt kê và tô cảnh báo. */
  holes: DiecutGeometry['holes']
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: DiecutSettings): void
  (e: 'apply-all'): void
  (e: 'add-top-hole'): void
  (e: 'spread-holes', count: number): void
}>()

const spreadCount = ref(3)

function patch(part: Partial<DiecutSettings>) {
  emit('update:modelValue', { ...props.modelValue, ...part })
}
function removeHole(index: number) {
  patch({ holes: props.modelValue.holes.filter((_, i) => i !== index) })
}

const DPI_OPTIONS = [
  { value: 150, label: '150 — bản nháp' },
  { value: 300, label: '300 — chuẩn in' },
  { value: 600, label: '600 — chi tiết nhỏ' },
]

// Khổ thành phẩm = phần hình + viền hai bên. Đây là con số khách hỏi ("ornament
// 8 inch"), nên phải hiện to chứ không bắt người dùng tự cộng.
const finishedW = computed(() => props.modelValue.artworkWidthMm + props.modelValue.offsetMm * 2)
const finishedH = computed(() => props.modelValue.artworkHeightMm + props.modelValue.offsetMm * 2)
const inches = computed(() => Math.max(finishedW.value, finishedH.value) / 25.4)

const round1 = (v: number) => Math.round(v * 10) / 10

// Khoá tỷ lệ: sửa một cạnh thì cạnh kia chạy theo, hình giữ nguyên dáng. Bỏ khoá
// thì gõ tự do — hình bị kéo méo, và chỗ này nói thẳng méo bao nhiêu.
function setWidth(v: number) {
  const next: Partial<DiecutSettings> = { artworkWidthMm: v }
  if (props.modelValue.lockAspect && props.naturalRatio > 0) {
    next.artworkHeightMm = round1(v * props.naturalRatio)
  }
  patch(next)
}
function setHeight(v: number) {
  const next: Partial<DiecutSettings> = { artworkHeightMm: v }
  if (props.modelValue.lockAspect && props.naturalRatio > 0) {
    next.artworkWidthMm = round1(v / props.naturalRatio)
  }
  patch(next)
}
function toggleLock() {
  const lock = !props.modelValue.lockAspect
  // Khoá lại thì kéo chiều cao về đúng tỷ lệ gốc luôn, không để hình méo âm thầm.
  patch(
    lock && props.naturalRatio > 0
      ? { lockAspect: true, artworkHeightMm: round1(props.modelValue.artworkWidthMm * props.naturalRatio) }
      : { lockAspect: lock },
  )
}
// Thanh phóng to: nhân đều CẢ HAI chiều, kể cả khi đang bỏ khoá tỷ lệ — "phóng
// to cả hình" mà chỉ kéo bề ngang thì hình méo thêm mỗi lần kéo.
function scaleBoth(newW: number) {
  const k = newW / Math.max(0.001, props.modelValue.artworkWidthMm)
  patch({
    artworkWidthMm: newW,
    artworkHeightMm: round1(props.modelValue.artworkHeightMm * k),
  })
}
function applyKnownSize() {
  if (!props.knownSizeMm) return
  setWidth(round1(props.knownSizeMm))
}
</script>

<template>
  <div class="space-y-5">
    <!-- 1. Tách hình khỏi nền -->
    <section>
      <h3 class="mb-2 text-sm font-semibold text-foreground">1 · Tách hình khỏi nền</h3>
      <div class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        <button
          v-for="m in [
            { key: 'alpha', label: 'Nền trong suốt' },
            { key: 'flood', label: 'Nền trắng' },
          ]"
          :key="m.key"
          class="rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
          :class="
            props.modelValue.mode === m.key
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="patch({ mode: m.key as DiecutSettings['mode'] })"
        >
          {{ m.label }}
        </button>
      </div>
      <p v-if="!props.hasAlpha && props.modelValue.mode === 'alpha'" class="mt-2 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
        File này không có vùng trong suốt — chọn "Nền trắng" thì mới tách được hình.
      </p>
      <div class="mt-3">
        <DiecutField
          v-if="props.modelValue.mode === 'alpha'"
          :model-value="props.modelValue.alphaThreshold"
          label="Ngưỡng đặc"
          :min="1"
          :max="250"
          :step="1"
          unit=""
          hint="Cao hơn thì bỏ bớt phần mờ ở rìa. Ảnh có bóng đổ mờ nên tăng lên."
          @update:model-value="patch({ alphaThreshold: $event })"
        />
        <DiecutField
          v-else
          :model-value="props.modelValue.floodTolerance"
          label="Dung sai màu nền"
          :min="2"
          :max="120"
          :step="1"
          unit=""
          hint="Nền ám vàng/xám thì tăng. Tăng quá thì ăn mất phần sáng của hình."
          @update:model-value="patch({ floodTolerance: $event })"
        />
      </div>
    </section>

    <!-- 2. Kích thước thật -->
    <section class="border-t border-border pt-4">
      <div class="mb-2 flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-foreground">2 · Kích thước thật</h3>
        <button
          class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
          :class="
            props.modelValue.lockAspect
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
          "
          :title="props.modelValue.lockAspect ? 'Đang giữ đúng tỷ lệ gốc — bấm để nhập tự do' : 'Đang cho kéo méo — bấm để khoá tỷ lệ'"
          @click="toggleLock"
        >
          <UiIcon :name="props.modelValue.lockAspect ? 'link' : 'close'" :size="12" />
          {{ props.modelValue.lockAspect ? 'Khoá tỷ lệ' : 'Tự do' }}
        </button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="label">Ngang (mm)</label>
          <input
            type="number"
            class="input tabular-nums"
            :value="props.modelValue.artworkWidthMm"
            min="5"
            max="2000"
            step="1"
            @change="setWidth(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div>
          <label class="label">Cao (mm)</label>
          <input
            type="number"
            class="input tabular-nums"
            :value="props.modelValue.artworkHeightMm"
            min="5"
            max="2000"
            step="1"
            @change="setHeight(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>
      <div class="mt-2">
        <DiecutField
          :model-value="props.modelValue.artworkWidthMm"
          label="Phóng to / thu nhỏ cả hình"
          :min="5"
          :max="600"
          :step="1"
          @update:model-value="scaleBoth($event)"
        />
      </div>
      <div class="mt-3 rounded-lg bg-muted px-3 py-2">
        <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Thành phẩm sau cắt</p>
        <p class="text-base font-bold tabular-nums text-foreground">
          {{ finishedW.toFixed(1) }} × {{ finishedH.toFixed(1) }} mm
        </p>
        <p class="text-[11px] text-muted-foreground">
          cạnh dài ≈ {{ inches.toFixed(2) }} inch · phần hình {{ props.modelValue.artworkWidthMm.toFixed(1) }} ×
          {{ props.modelValue.artworkHeightMm.toFixed(1) }} mm
        </p>
        <p v-if="Math.abs(props.stretchPct) >= 1" class="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          Hình đang bị kéo {{ props.stretchPct > 0 ? 'cao' : 'bẹt' }} {{ Math.abs(props.stretchPct).toFixed(1) }}% so với
          tỷ lệ gốc.
        </p>
      </div>
      <button
        v-if="props.knownSizeMm"
        class="mt-2 text-xs font-medium text-primary hover:underline"
        @click="applyKnownSize"
      >
        Lấy đúng khổ trong file gốc ({{ props.knownSizeMm.toFixed(1) }} mm)
      </button>
    </section>

    <!-- 3. Đường cắt -->
    <section class="border-t border-border pt-4">
      <h3 class="mb-2 text-sm font-semibold text-foreground">3 · Đường cắt</h3>
      <div class="space-y-3">
        <DiecutField
          :model-value="props.modelValue.offsetMm"
          label="Viền quanh hình"
          :min="-10"
          :max="20"
          :step="0.5"
          hint="Số âm là cắt lẹm vào trong hình."
          @update:model-value="patch({ offsetMm: $event })"
        />
        <DiecutField
          :model-value="props.modelValue.roundInsideMm"
          label="Bo tròn góc lõm"
          :min="0"
          :max="10"
          :step="0.5"
          hint="Bán kính nhỏ nhất ở chỗ hai chi tiết gặp nhau; khe hẹp hơn 2 lần số này được lấp kín. 0 = giữ góc nhọn."
          @update:model-value="patch({ roundInsideMm: $event })"
        />
        <DiecutField
          :model-value="props.modelValue.simplifyMm"
          label="Sai số đường cong"
          :min="0.01"
          :max="1"
          :step="0.01"
          hint="Đường cong được phép lệch tối đa bấy nhiêu so với đường tính toán (không nhỏ hơn nửa điểm ảnh của ảnh gốc). Nhỏ thì bám sát từng chi tiết; lớn thì mềm và ít nút hơn."
          @update:model-value="patch({ simplifyMm: $event })"
        />
        <DiecutField
          :model-value="props.modelValue.despeckleMm2"
          label="Bỏ mảnh vụn nhỏ hơn"
          :min="0"
          :max="50"
          :step="0.5"
          unit="mm²"
          @update:model-value="patch({ despeckleMm2: $event })"
        />
        <DiecutField
          :model-value="props.modelValue.fillHolesMm2"
          label="Lấp lỗ kín nhỏ hơn"
          :min="0"
          :max="50"
          :step="0.5"
          unit="mm²"
          hint="Lỗ li ti laser cắt ra chỉ thành vết cháy nên lấp luôn."
          @update:model-value="patch({ fillHolesMm2: $event })"
        />
        <!-- Bỏ từng đường: cho khe hở / lỗ to hơn ngưỡng lấp mà thực tế không cắt,
             khỏi phải kéo ngưỡng chung rồi lấp nhầm chỗ khác. -->
        <div class="rounded-md bg-muted/60 px-2.5 py-2 text-[11px] text-muted-foreground">
          <div class="flex items-center justify-between gap-2">
            <span>Đường cắt bỏ bằng tay: <b class="tabular-nums text-foreground">{{ props.modelValue.skippedRings.length }}</b></span>
            <button
              v-if="props.modelValue.skippedRings.length"
              class="text-primary hover:underline"
              @click="patch({ skippedRings: [] })"
            >
              Khôi phục hết
            </button>
          </div>
          <p class="mt-1 leading-snug">
            Giữ <b class="text-foreground">Alt</b> (Option) rồi bấm vào một đường đỏ trong ảnh xem trước để bỏ đường đó
            khỏi file cắt; bấm lại đường nét đứt để khôi phục. Không bỏ được đường bao ngoài.
          </p>
        </div>
      </div>
    </section>

    <!-- 4. Lỗ khoan -->
    <section class="border-t border-border pt-4">
      <div class="mb-2 flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-foreground">4 · Lỗ khoan</h3>
        <span class="text-[11px] text-muted-foreground">{{ props.modelValue.holes.length }} lỗ</span>
      </div>

      <div class="flex flex-wrap gap-2">
        <button class="btn-secondary px-2 py-1 text-xs" @click="emit('add-top-hole')">
          <UiIcon name="plus" :size="13" /> Lỗ treo trên đỉnh
        </button>
        <button
          v-if="props.modelValue.holes.length"
          class="btn-secondary px-2 py-1 text-xs"
          @click="patch({ holes: [] })"
        >
          <UiIcon name="trash" :size="13" /> Xoá hết
        </button>
      </div>

      <div class="mt-2 flex items-end gap-2">
        <div class="w-20">
          <label class="label">Rải đều</label>
          <input v-model.number="spreadCount" type="number" min="1" max="60" step="1" class="input tabular-nums" />
        </div>
        <button class="btn-secondary mb-0.5 px-2 py-1 text-xs" @click="emit('spread-holes', spreadCount)">
          lỗ bám mép trên
        </button>
      </div>
      <p class="mt-1 text-[11px] leading-snug text-muted-foreground">
        Rải đều theo bề ngang hình, bám mép trên nên đỉnh cong thì hàng lỗ uốn theo dáng sản phẩm.
        Cần đặt tay thì bấm thẳng vào ảnh xem trước, mỗi lần bấm là thêm một lỗ.
      </p>

      <div class="mt-3 space-y-3">
        <DiecutField
          :model-value="props.modelValue.holeDiameterMm"
          label="Đường kính (dùng chung mọi lỗ)"
          :min="1"
          :max="30"
          :step="0.5"
          @update:model-value="patch({ holeDiameterMm: $event })"
        />
        <DiecutField
          :model-value="props.modelValue.holeMarginMm"
          label="Vật liệu chừa phía trên lỗ treo"
          :min="0.5"
          :max="30"
          :step="0.5"
          hint="Áp dụng khi bấm nút lỗ treo trên đỉnh. Dưới 2 mm là dễ bục khi treo."
          @update:model-value="patch({ holeMarginMm: $event })"
        />
      </div>

      <!-- Danh sách lỗ: toạ độ thật và khoảng hở đo được, không phải số đã gõ -->
      <ul v-if="props.holes.length" class="mt-3 max-h-44 space-y-1 overflow-y-auto">
        <li
          v-for="(h, i) in props.holes"
          :key="i"
          class="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1 text-[11px]"
        >
          <span class="tabular-nums text-foreground">
            Lỗ {{ i + 1 }} · {{ h.cxMm.toFixed(1) }} × {{ h.cyMm.toFixed(1) }} mm
          </span>
          <span class="flex items-center gap-1.5">
            <span
              class="tabular-nums"
              :class="h.clearanceMm < 1.5 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted-foreground'"
              :title="`Vật liệu còn lại từ mép lỗ tới mép cắt: ${h.clearanceMm.toFixed(1)} mm`"
            >
              hở {{ h.clearanceMm.toFixed(1) }}
            </span>
            <button class="rounded p-0.5 text-muted-foreground hover:text-destructive" @click="removeHole(i)">
              <UiIcon name="close" :size="12" />
            </button>
          </span>
        </li>
      </ul>
    </section>

    <!-- 5. File in -->
    <section class="border-t border-border pt-4">
      <h3 class="mb-2 text-sm font-semibold text-foreground">5 · File in</h3>
      <label class="label">Độ phân giải</label>
      <UiSelect
        :model-value="String(props.modelValue.printDpi)"
        :options="DPI_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))"
        @update:model-value="patch({ printDpi: Number($event) })"
      />
      <div class="mt-3">
        <DiecutField
          :model-value="props.modelValue.bleedMm"
          label="Tràn lề (bleed)"
          :min="0"
          :max="5"
          :step="0.5"
          hint="Kéo màu mép ra ngoài phòng khi máy cắt lệch. Để 0 nếu sản phẩm cần chừa viền trắng."
          @update:model-value="patch({ bleedMm: $event })"
        />
      </div>
      <div class="mt-3">
        <DiecutField
          :model-value="props.modelValue.thinWarnMm"
          label="Cảnh báo chỗ mảnh hơn"
          :min="0.5"
          :max="10"
          :step="0.5"
          hint="Theo bề dày vật liệu và độ giòn: gỗ mỏng nên để 2–3 mm."
          @update:model-value="patch({ thinWarnMm: $event })"
        />
      </div>
    </section>

    <button v-if="props.multi" class="btn-secondary w-full" @click="emit('apply-all')">
      <UiIcon name="layers" :size="15" /> Áp thông số này cho tất cả file
    </button>
  </div>
</template>
