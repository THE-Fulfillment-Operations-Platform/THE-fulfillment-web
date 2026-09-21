<script setup lang="ts">
import type { DiecutSettings } from '~/utils/diecut/pipeline'

// Bảng thông số. Xếp theo đúng thứ tự người ta nghĩ khi làm file:
//   tách hình → đặt kích thước thật → vẽ đường cắt → khoan lỗ treo → chất lượng in.
const props = defineProps<{
  modelValue: DiecutSettings
  artworkHeightMm: number
  hasAlpha: boolean
  knownSizeMm: number | null
  multi: boolean
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: DiecutSettings): void
  (e: 'apply-all'): void
}>()

function patch(part: Partial<DiecutSettings>) {
  emit('update:modelValue', { ...props.modelValue, ...part })
}
function patchHole(part: Partial<DiecutSettings['hole']>) {
  emit('update:modelValue', { ...props.modelValue, hole: { ...props.modelValue.hole, ...part } })
}

const DPI_OPTIONS = [
  { value: 150, label: '150 — bản nháp' },
  { value: 300, label: '300 — chuẩn in' },
  { value: 600, label: '600 — chi tiết nhỏ' },
]

// Khổ thành phẩm = phần hình + viền hai bên. Đây là con số khách hỏi ("ornament
// 8 inch"), nên phải hiện to chứ không bắt người dùng tự cộng.
const finishedW = computed(() => props.modelValue.artworkWidthMm + props.modelValue.offsetMm * 2)
const finishedH = computed(() => props.artworkHeightMm + props.modelValue.offsetMm * 2)
const inches = computed(() => Math.max(finishedW.value, finishedH.value) / 25.4)
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
      <h3 class="mb-2 text-sm font-semibold text-foreground">2 · Kích thước thật</h3>
      <DiecutField
        :model-value="props.modelValue.artworkWidthMm"
        label="Bề ngang phần hình"
        :min="5"
        :max="1200"
        :step="1"
        @update:model-value="patch({ artworkWidthMm: $event })"
      />
      <div class="mt-3 rounded-lg bg-muted px-3 py-2">
        <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Thành phẩm sau cắt</p>
        <p class="text-base font-bold tabular-nums text-foreground">
          {{ finishedW.toFixed(1) }} × {{ finishedH.toFixed(1) }} mm
        </p>
        <p class="text-[11px] text-muted-foreground">
          cạnh dài ≈ {{ inches.toFixed(2) }} inch · phần hình {{ props.modelValue.artworkWidthMm.toFixed(1) }} ×
          {{ props.artworkHeightMm.toFixed(1) }} mm
        </p>
      </div>
      <button
        v-if="props.knownSizeMm"
        class="mt-2 text-xs font-medium text-primary hover:underline"
        @click="patch({ artworkWidthMm: Math.round(props.knownSizeMm * 10) / 10 })"
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
          :model-value="props.modelValue.simplifyMm"
          label="Sai số làm gọn"
          :min="0.01"
          :max="1"
          :step="0.01"
          hint="Nhỏ thì đường bám sát hình nhưng file nặng; lớn thì đường mượt và gọn hơn."
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
      </div>
    </section>

    <!-- 4. Lỗ treo -->
    <section class="border-t border-border pt-4">
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-foreground">4 · Lỗ treo</h3>
        <button
          class="relative h-5 w-9 rounded-full transition-colors"
          :class="props.modelValue.hole.enabled ? 'bg-primary' : 'bg-muted-foreground/30'"
          role="switch"
          :aria-checked="props.modelValue.hole.enabled"
          @click="patchHole({ enabled: !props.modelValue.hole.enabled })"
        >
          <span
            class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
            :class="props.modelValue.hole.enabled ? 'left-[1.125rem]' : 'left-0.5'"
          />
        </button>
      </div>
      <div class="space-y-3">
        <DiecutField
          :model-value="props.modelValue.hole.diameterMm"
          label="Đường kính"
          :min="1"
          :max="20"
          :step="0.5"
          :disabled="!props.modelValue.hole.enabled"
          @update:model-value="patchHole({ diameterMm: $event })"
        />
        <DiecutField
          :model-value="props.modelValue.hole.marginMm"
          label="Vật liệu còn lại phía trên"
          :min="0.5"
          :max="30"
          :step="0.5"
          :disabled="!props.modelValue.hole.enabled"
          hint="Tính từ mép cắt tới mép lỗ. Dưới 2 mm là dễ bục khi treo."
          @update:model-value="patchHole({ marginMm: $event })"
        />
        <DiecutField
          :model-value="Math.round(props.modelValue.hole.xRatio * 100)"
          label="Vị trí ngang"
          :min="0"
          :max="100"
          :step="1"
          unit="%"
          :disabled="!props.modelValue.hole.enabled"
          hint="Hoặc bấm thẳng vào ảnh xem trước để đặt lỗ."
          @update:model-value="patchHole({ xRatio: $event / 100 })"
        />
      </div>
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
