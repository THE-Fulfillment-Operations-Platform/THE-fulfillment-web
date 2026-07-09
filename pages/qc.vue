<script setup lang="ts">
import { qcApi } from '~/services/api'
import type { QcScanResult } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { isValidUrl, toDisplayImageUrl } from '~/utils/format'
import { useToastStore } from '~/stores/toast'
import { DEFECT_CODE_OPTIONS } from '~/utils/enums'

// Scan-driven QC station (Wireframe: Scan QC). The operator scans an item code,
// the screen pulls the canonical mockup + engrave text, and PASS advances the
// item to QC_PASSED while FAIL logs a defect note for follow-up.
const toast = useToastStore()

const code = ref('')
const scanInput = ref<HTMLInputElement | null>(null)
const scanning = ref(false)
const result = ref<QcScanResult | null>(null)
const scanError = ref<string | null>(null)

// Manual visual checklist — QC must confirm each before PASS is enabled.
const checks = reactive({ mockup: false, engrave: false, quality: false })
const allChecked = computed(() => checks.mockup && checks.engrave && checks.quality)
// Item đã QC PASS rồi → chặn quét/PASS lại để không ghi trùng bản ghi QC.
const alreadyQC = computed(() => result.value?.internal_status === 'QC_PASSED')

// Mockup preview: convert share links (e.g. Google Drive) to a directly-embeddable
// URL, and track load failures so a broken/non-image link shows a clean fallback
// instead of the browser's broken-image icon. Reset the error flag on each scan.
const mockupSrc = computed(() => toDisplayImageUrl(result.value?.mockup_url))
const mockupError = ref(false)
watch(() => result.value?.mockup_url, () => { mockupError.value = false })

const passing = ref(false)
const failOpen = ref(false)
const failing = ref(false)
const defect = reactive({ defect_code: 'PRINT_WRONG', note: '' })


function resetChecks() {
  checks.mockup = false
  checks.engrave = false
  checks.quality = false
}

function focusScan() {
  nextTick(() => scanInput.value?.focus())
}

async function scan() {
  const value = code.value.trim()
  if (!value || scanning.value) return
  scanning.value = true
  scanError.value = null
  try {
    const { data } = await qcApi.scan({ code: value })
    result.value = data
    resetChecks()
  } catch (e) {
    result.value = null
    scanError.value = errorMessage(e)
  } finally {
    scanning.value = false
    code.value = ''
    focusScan()
  }
}

function clearStation() {
  result.value = null
  scanError.value = null
  resetChecks()
  focusScan()
}

async function pass() {
  if (!result.value || !allChecked.value || passing.value || alreadyQC.value) return
  passing.value = true
  try {
    await qcApi.pass({ item_id: result.value.item_id })
    toast.success(`${result.value.item_code} đã QC PASS → Đã QC`)
    clearStation()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    passing.value = false
  }
}

function openFail() {
  defect.defect_code = 'PRINT_WRONG'
  defect.note = ''
  failOpen.value = true
}

async function submitFail() {
  if (!result.value || failing.value) return
  failing.value = true
  try {
    await qcApi.fail({
      item_id: result.value.item_id,
      defect_code: defect.defect_code,
      note: defect.note || undefined,
    })
    toast.error(`${result.value.item_code} đã ghi nhận lỗi QC — tạo note theo dõi`)
    failOpen.value = false
    clearStation()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    failing.value = false
  }
}

onMounted(focusScan)
</script>

<template>
  <div>
    <PageHeader
      title="Quét QC"
      subtitle="Quét mã item → đối chiếu mockup → PASS (Đã QC) hoặc FAIL (ghi lỗi)"
    />

    <!-- Scan bar -->
    <div class="card mb-5 p-4">
      <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="scan">
        <div class="flex-1">
          <label class="label" for="qc-scan">Mã item / batch item</label>
          <input
            id="qc-scan"
            ref="scanInput"
            v-model="code"
            class="input font-mono text-base"
            placeholder="Quét hoặc nhập mã rồi Enter…"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <button type="submit" class="btn-primary sm:w-40" :disabled="scanning || !code.trim()">
          <UiSpinner v-if="scanning" :size="16" />
          <UiIcon v-else name="qc" :size="16" /> Quét
        </button>
      </form>
      <p v-if="scanError" class="mt-3 rounded-md bg-red-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-red-700 dark:text-rose-300">
        {{ scanError }}
      </p>
    </div>

    <!-- Idle state -->
    <div v-if="!result" class="card flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
      <div class="rounded-full bg-muted p-4">
        <UiIcon name="qc" :size="32" />
      </div>
      <p class="text-sm">Quét một mã item để bắt đầu kiểm tra QC.</p>
    </div>

    <!-- QC comparison -->
    <div v-else class="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <!-- Mockup -->
      <div class="card overflow-hidden">
        <div class="flex items-center justify-between border-b border-border bg-muted px-4 py-2.5">
          <h3 class="text-sm font-semibold text-foreground">Mockup chuẩn (seller)</h3>
          <UiMockupLink :url="result.mockup_url" small label="Mở tab mới" />
        </div>
        <div class="flex min-h-[14rem] items-center justify-center bg-slate-900 p-4 sm:min-h-[18rem] lg:min-h-[22rem]">
          <img
            v-if="isValidUrl(result.mockup_url) && !mockupError"
            :src="mockupSrc"
            :alt="`Mockup ${result.item_code}`"
            class="max-h-[14rem] max-w-full rounded object-contain sm:max-h-[20rem] lg:max-h-[28rem]"
            @error="mockupError = true"
          />
          <div v-else class="flex flex-col items-center gap-2 text-center text-slate-300">
            <UiIcon name="alert" :size="28" />
            <p v-if="!isValidUrl(result.mockup_url)" class="text-sm">Item này chưa có mockup — không thể đối chiếu.</p>
            <template v-else>
              <p class="text-sm">Ảnh mockup không tải được — link không phải ảnh trực tiếp.</p>
              <UiMockupLink :url="result.mockup_url" small label="Mở mockup ở tab mới" />
            </template>
          </div>
        </div>
      </div>

      <!-- Detail + checklist + actions -->
      <div class="space-y-5">
        <div class="card p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-mono text-lg font-semibold text-foreground">{{ result.item_code }}</p>
              <p class="text-sm text-muted-foreground">
                {{ result.order_code }} · {{ result.store_order_id }}
              </p>
            </div>
            <UiStatusBadge kind="internal" :value="result.internal_status" />
          </div>

          <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt class="text-xs text-muted-foreground">SKU</dt>
              <dd class="font-medium text-foreground">{{ result.sku_code }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Loại VL</dt>
              <dd class="text-foreground">{{ result.material_name || '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Sản phẩm</dt>
              <dd class="text-foreground">{{ result.product_name || '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Số lượng</dt>
              <dd class="font-medium text-foreground">{{ result.quantity ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Mã ảnh</dt>
              <dd class="text-foreground">{{ result.image_code || '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">File in / cắt</dt>
              <dd class="flex items-center gap-3 text-xs">
                <a v-if="result.print_file_url" :href="result.print_file_url" target="_blank" class="inline-flex items-center gap-1 text-primary hover:underline"><UiIcon name="link" :size="13" /> In</a>
                <span v-else class="text-muted-foreground">In ✗</span>
                <a v-if="result.cut_file_url" :href="result.cut_file_url" target="_blank" class="inline-flex items-center gap-1 text-primary hover:underline"><UiIcon name="link" :size="13" /> Cắt</a>
                <span v-else class="text-muted-foreground">Cắt ✗</span>
                <a v-if="result.design_url" :href="result.design_url" target="_blank" class="inline-flex items-center gap-1 text-primary hover:underline"><UiIcon name="link" :size="13" /> Link ảnh</a>
              </dd>
            </div>
            <div v-if="result.qc_description" class="col-span-2">
              <dt class="text-xs text-muted-foreground">Mô tả SP để QC</dt>
              <dd class="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{{ result.qc_description }}</dd>
            </div>
            <div class="col-span-2">
              <dt class="text-xs text-muted-foreground">Nội dung khắc (engrave)</dt>
              <dd class="rounded-md bg-amber-50 px-3 py-2 font-mono text-base font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                {{ result.engrave_text || '— (không có) —' }}
              </dd>
            </div>
          </dl>

          <div v-if="result.batches?.length" class="mt-4 border-t border-border pt-3">
            <p class="mb-2 text-xs font-medium text-muted-foreground">Thuộc batch</p>
            <div class="flex flex-wrap gap-2">
              <NuxtLink
                v-for="b in result.batches"
                :key="b.batch_item_id"
                :to="`/batches/${b.batch_code.replace('#', '')}`"
                class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
              >
                {{ b.batch_code }} · {{ b.material_code }}
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- Checklist -->
        <div class="card p-5">
          <div
            v-if="alreadyQC"
            class="mb-4 flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
          >
            <UiIcon name="check" :size="18" class="mt-0.5 shrink-0" />
            <div>
              <p class="font-semibold">Item này đã QC rồi</p>
              <p class="mt-0.5 text-xs text-emerald-700/90 dark:text-emerald-300/90">
                Không cần quét lại. Bấm “Bỏ qua / Quét mã khác” để tiếp tục item khác.
              </p>
            </div>
          </div>
          <h3 class="mb-3 text-sm font-semibold text-foreground">Checklist đối chiếu</h3>
          <div class="space-y-2.5">
            <label class="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 hover:bg-muted">
              <input v-model="checks.mockup" type="checkbox" class="h-4 w-4 rounded border-border text-primary focus:ring-ring" />
              <span class="text-sm text-foreground">Thành phẩm khớp với mockup chuẩn</span>
            </label>
            <label class="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 hover:bg-muted">
              <input v-model="checks.engrave" type="checkbox" class="h-4 w-4 rounded border-border text-primary focus:ring-ring" />
              <span class="text-sm text-foreground">Nội dung khắc đúng từng ký tự</span>
            </label>
            <label class="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 hover:bg-muted">
              <input v-model="checks.quality" type="checkbox" class="h-4 w-4 rounded border-border text-primary focus:ring-ring" />
              <span class="text-sm text-foreground">Không lỗi in/cắt/vật liệu</span>
            </label>
          </div>

          <div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              class="btn-success"
              :disabled="!allChecked || passing || alreadyQC"
              :title="alreadyQC ? 'Item đã QC rồi' : !allChecked ? 'Phải tích đủ 3 mục checklist' : ''"
              @click="pass"
            >
              <UiSpinner v-if="passing" :size="16" />
              <UiIcon v-else name="check" :size="16" /> {{ alreadyQC ? 'Đã QC' : 'PASS — Đã QC' }}
            </button>
            <button class="btn-danger" :disabled="failing || alreadyQC" :title="alreadyQC ? 'Item đã QC rồi' : ''" @click="openFail">
              <UiIcon name="alert" :size="16" /> FAIL — Ghi lỗi
            </button>
          </div>
          <button class="btn-secondary mt-2 w-full" @click="clearStation">Bỏ qua / Quét mã khác</button>
        </div>
      </div>
    </div>

    <!-- Fail modal -->
    <UiModal v-model="failOpen" title="Ghi nhận lỗi QC">
      <div class="space-y-3">
        <p class="text-sm text-foreground">
          Item <span class="font-mono font-semibold">{{ result?.item_code }}</span> sẽ bị đánh dấu lỗi và tạo note theo dõi cho bộ phận liên quan.
        </p>
        <div>
          <label class="label">Loại lỗi</label>
          <UiSelect v-model="defect.defect_code" :options="DEFECT_CODE_OPTIONS" aria-label="Loại lỗi" />
        </div>
        <div>
          <label class="label">Ghi chú (tuỳ chọn)</label>
          <textarea v-model="defect.note" rows="3" class="input" placeholder="Mô tả chi tiết lỗi…" />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="failOpen = false">Huỷ</button>
        <button class="btn-danger" :disabled="failing" @click="submitFail">
          <UiSpinner v-if="failing" :size="16" /> Xác nhận lỗi
        </button>
      </template>
    </UiModal>
  </div>
</template>
