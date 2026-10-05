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
  return [{ value: '', label: 'Chọn dịch vụ…' }, ...opts]
})
</script>

<template>
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-foreground">
        <UiIcon name="shipping" :size="16" /> Kết nối THE (tạo đơn vận chuyển + label)
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
        <p v-if="cfg?.problem" class="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {{ cfg.problem }}
        </p>

        <div>
          <label class="label">API token của tài khoản THE</label>
          <input
            v-model="form.token"
            type="password"
            autocomplete="off"
            class="input font-mono"
            :placeholder="cfg?.has_token ? `Đã lưu ${cfg.token_hint} — dán token mới để thay` : 'Dán token vào đây'"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">
            Lấy ở <b class="text-foreground">app.thehuman.express → Cài đặt → API</b> (trang /setting/api): bấm hình con mắt để hiện
            token rồi copy. <b class="text-rose-600 dark:text-rose-400">Không bấm "Reset token"</b> — nút đó làm token cũ chết ngay.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label class="label">Dịch vụ THE</label>
            <UiSelect v-model="form.service" :options="serviceOptions" aria-label="Dịch vụ THE" />
            <p class="mt-1 text-[11px] text-muted-foreground">Bấm "Kiểm tra kết nối" để tải danh sách dịch vụ.</p>
          </div>
          <div>
            <label class="label">SĐT mặc định</label>
            <input v-model="form.phone" class="input" placeholder="VD: 0987654321" />
            <p class="mt-1 text-[11px] text-muted-foreground">Dùng khi đơn đi nước ngoài không có SĐT (đơn đi Mỹ không cần).</p>
          </div>
          <div>
            <label class="label">Cân nặng bao bì (g)</label>
            <input v-model="form.packaging" type="number" min="0" step="1" class="input" placeholder="VD: 30" />
            <p class="mt-1 text-[11px] text-muted-foreground">Cộng thêm một lần cho mỗi kiện (hộp, xốp).</p>
          </div>
        </div>

        <!-- Hải quan: việc của bên THE, xưởng không cần biết. SKU khai riêng thì SKU thắng. -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Mã HS mặc định</label>
            <input v-model="form.hs" class="input font-mono" placeholder="Mã HS có trong bảng mã của THE" />
          </div>
          <div>
            <label class="label">Giá trị khai báo mặc định (USD / sản phẩm)</label>
            <input v-model="form.value" type="number" min="0" step="0.01" class="input" placeholder="VD: 5" />
          </div>
        </div>
        <p class="-mt-2 text-[11px] text-muted-foreground">
          Áp cho mọi SKU không tự khai. Xưởng chỉ khai cân nặng + kích thước hộp; SKU nào cần mã HS / giá trị khác thì khai riêng ở Master Data.
          Mã HS phải đúng mã THE có, không THE từ chối đơn.
        </p>

        <div
          v-if="check"
          class="rounded-md px-3 py-2 text-xs"
          :class="check.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'"
        >
          <template v-if="check.ok">
            ✓ Token dùng được · Số dư ví THE: <b>${{ check.balance.toFixed(2) }}</b>
            <template v-if="check.debt"> · Nợ: ${{ check.debt.toFixed(2) }}</template>
            · {{ check.services.length }} dịch vụ
          </template>
          <template v-else>{{ check.message }}</template>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button class="btn-secondary" :disabled="checking || saving" @click="runCheck">
            <UiSpinner v-if="checking" :size="14" /> Kiểm tra kết nối
          </button>
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
        <p class="text-[11px] text-muted-foreground">
          Khi bật: mỗi đơn "Gửi cho THE" được tạo và chốt trên THE (trừ ví), lấy mã THE + label về để in, mã USPS chặng cuối tự gắn vào đơn.
          Đơn cần cân nặng + kích thước hộp ở SKU (Master Data → SKU → Vận chuyển).
        </p>
      </UiStateBlock>
    </div>
  </div>
</template>
