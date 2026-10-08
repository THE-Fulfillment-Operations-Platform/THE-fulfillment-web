<script setup lang="ts">
// Kết nối THE: khi bật, bấm "Gửi cho THE" ở màn Chờ gửi hàng sẽ TẠO ĐƠN THẬT trên
// THE (trừ tiền ví THE của xưởng), lấy mã THE + label về in, và tự gắn mã USPS.
// Tắt thì "Gửi cho THE" chỉ ghi nhận bàn giao như trước.
//
// Token là chìa khoá ví: máy chủ lưu niêm phong, màn này chỉ thấy 4 ký tự cuối.
import { carrierApi } from '~/services/api'
import type { CarrierConfig, CarrierCheck } from '~/services/api'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'

const toast = useToastStore()
const cfg = ref<CarrierConfig | null>(null)
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const checking = ref(false)
const check = ref<CarrierCheck | null>(null)

// Mở sẵn khối hải quan khi chưa đặt — bắt buộc để tạo đơn, không được giấu.
const advancedOpen = computed(() => !!cfg.value && (!cfg.value.default_hs_code || !cfg.value.default_declared_value))

const form = reactive({
  token: '',
  service: '',
  phone: '',
  packaging: '' as string | number,
  hs: '',
  value: '' as string | number,
})

function fill(c: CarrierConfig) {
  cfg.value = c
  form.token = ''
  form.service = c.service_code
  form.phone = c.default_phone
  form.packaging = c.packaging_weight_g || ''
  form.hs = c.default_hs_code
  form.value = c.default_declared_value || ''
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const { data } = await carrierApi.getConfig()
    fill(data)
  } catch (e) {
    loadError.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function save(extra: { enabled?: boolean } = {}) {
  saving.value = true
  try {
    const num = (v: string | number) => {
      const n = Number(String(v).replace(',', '.'))
      return Number.isFinite(n) && n > 0 ? n : 0
    }
    const { data } = await carrierApi.updateConfig({
      token: form.token.trim() || undefined,
      service_code: form.service.trim(),
      default_phone: form.phone.trim(),
      packaging_weight_g: num(form.packaging),
      default_hs_code: form.hs.trim(),
      default_declared_value: num(form.value),
      ...extra,
    })
    fill(data)
    toast.success('Đã lưu kết nối THE')
    return true
  } catch (e) {
    toast.error(errorMessage(e))
    return false
  } finally {
    saving.value = false
  }
}

async function runCheck() {
  if (form.token.trim() && !(await save())) return
  checking.value = true
  try {
    const { data } = await carrierApi.check()
    check.value = data
    if (data.ok && !form.service && data.services.length === 1) form.service = data.services[0]!.code
    if (data.ok) toast.success('Kết nối THE dùng được')
    else toast.error(data.message || 'Kết nối THE chưa dùng được')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    checking.value = false
  }
}

async function toggle(on: boolean) {
  if (on) {
    const ok = await useConfirm().confirm({
      title: 'Bật tạo đơn THE',
      message:
        'Từ giờ bấm "Gửi cho THE" ở màn Chờ gửi hàng sẽ TẠO ĐƠN THẬT trên THE và TRỪ TIỀN ví THE của xưởng ' +
        '(mỗi đơn một lần, không bao giờ trừ hai lần cho một đơn). Đơn nào thiếu dữ liệu sẽ bị giữ lại kèm lý do.',
      confirmText: 'Bật',
    })
    if (!ok) return
  }
  await save({ enabled: on })
}

const serviceOptions = computed(() => {
  const list = check.value?.services ?? []
  const opts = list.map((s) => ({ value: s.code, label: s.name === s.code ? s.code : `${s.name} (${s.code})` }))
  if (form.service && !opts.some((o) => o.value === form.service)) opts.unshift({ value: form.service, label: form.service })
  return opts
})
</script>

<template>
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-foreground">
        <UiIcon name="shipping" :size="16" /> Kết nối THE
      </h3>
      <span
        v-if="cfg"
        class="rounded-md px-2 py-0.5 text-xs font-medium"
        :class="cfg.enabled && cfg.ready
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-muted text-muted-foreground'"
      >
        {{ cfg.enabled ? (cfg.ready ? 'Đang bật' : 'Bật nhưng chưa đủ') : 'Đang tắt' }}
      </span>
    </div>

    <div class="space-y-4 p-5">
      <UiStateBlock :loading="loading" :error="loadError" @retry="load">
        <!-- Chỉ báo vấn đề khi đã bật mà thiếu gì — lúc tắt thì trạng thái "Đang tắt" đã đủ nói. -->
        <p v-if="cfg?.enabled && cfg.problem" class="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {{ cfg.problem }}
        </p>

        <!-- Bước 1: token + kiểm tra -->
        <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div class="flex-1">
            <label class="label">API token THE</label>
            <input
              v-model="form.token"
              type="password"
              autocomplete="off"
              class="input font-mono"
              :placeholder="cfg?.has_token ? `Đã lưu ${cfg.token_hint}` : 'Dán token từ app THE → Cài đặt → API'"
            />
          </div>
          <button class="btn-secondary sm:w-44" :disabled="checking || saving" @click="runCheck">
            <UiSpinner v-if="checking" :size="14" /> Kiểm tra kết nối
          </button>
        </div>
        <p
          v-if="check"
          class="-mt-2 text-xs"
          :class="check.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'"
        >
          <template v-if="check.ok">
            ✓ Kết nối được · Ví THE: <b>${{ check.balance.toFixed(2) }}</b><template v-if="check.debt"> (nợ ${{ check.debt.toFixed(2) }})</template>
            <span v-if="check.balance <= 0" class="ml-1 font-medium text-amber-700 dark:text-amber-300">— ví 0 đồng, nạp trước khi gửi đơn</span>
          </template>
          <template v-else>{{ check.message }}</template>
        </p>

        <!-- Bước 2: dịch vụ -->
        <div class="sm:w-1/2 sm:pr-1">
          <label class="label">Dịch vụ gửi</label>
          <UiSelect v-model="form.service" :options="serviceOptions" aria-label="Dịch vụ THE" :placeholder="check ? 'Chọn dịch vụ…' : 'Kiểm tra kết nối để tải danh sách'" />
        </div>

        <!-- Hải quan + tuỳ chọn: đặt một lần, gập lại cho khỏi rối -->
        <details class="rounded-md border border-border" :open="advancedOpen">
          <summary class="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground">
            Khai báo hải quan &amp; tuỳ chọn
            <span v-if="!form.hs || !form.value" class="ml-1 text-amber-700 dark:text-amber-300">· chưa đặt mã HS / giá trị</span>
          </summary>
          <div class="grid grid-cols-1 gap-3 border-t border-border p-3 sm:grid-cols-2">
            <div>
              <label class="label">Mã HS mặc định</label>
              <input v-model="form.hs" class="input font-mono" placeholder="Mã trong bảng mã HS của THE" />
            </div>
            <div>
              <label class="label">Giá trị khai báo (USD / sản phẩm)</label>
              <input v-model="form.value" type="number" min="0" step="0.01" class="input" placeholder="VD: 5" />
            </div>
            <div>
              <label class="label">Cân nặng bao bì (g)</label>
              <input v-model="form.packaging" type="number" min="0" step="1" class="input" placeholder="Cộng thêm mỗi kiện, VD: 25" />
            </div>
            <div>
              <label class="label">SĐT người gửi</label>
              <input v-model="form.phone" class="input" placeholder="Dùng khi đơn không có SĐT" />
            </div>
            <p class="text-[11px] text-muted-foreground sm:col-span-2">
              Áp cho mọi SKU không khai riêng. Xưởng chỉ cần khai cân nặng + kích thước hộp ở Master Data → SKU.
            </p>
          </div>
        </details>

        <div class="flex flex-wrap items-center gap-2 pt-1">
          <button class="btn-primary" :disabled="saving" @click="save()">
            <UiSpinner v-if="saving" :size="14" /> Lưu
          </button>
          <span class="flex-1" />
          <button
            v-if="cfg && !cfg.enabled"
            class="btn-success"
            :disabled="saving || !cfg.has_token || !form.service"
            :title="!cfg.has_token ? 'Lưu token trước' : !form.service ? 'Chọn dịch vụ trước' : ''"
            @click="toggle(true)"
          >
            Bật tạo đơn THE
          </button>
          <button v-else-if="cfg" class="btn-secondary" :disabled="saving" @click="toggle(false)">Tắt</button>
        </div>
      </UiStateBlock>
    </div>
  </div>
</template>
