<script setup lang="ts">
import { importsApi, ordersApi, sellersApi, skusApi } from '~/services/api'
import type { ImportError, ImportRow, Seller, Sku } from '~/types'
import { importErrorVi } from '~/utils/import-errors'
import { refreshActionCounts } from '~/composables/useActionCounts'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'

// Tạo đơn lẻ — công cụ test của Kỹ thuật viên, KHÔNG role nào khác thấy (kể cả
// OWNER): người vận hành xưởng không được vô tình bơm đơn giả vào sản xuất.
//
// Form không tự tạo đơn bằng đường riêng. Nó gửi đúng các dòng một file import
// sẽ có (cùng tên cột template) qua Preview → Commit của màn Import, nên đơn test
// được kiểm tra, gom dòng, gán mã, vào Chờ duyệt y hệt đơn thật — test ra lỗi gì
// thì đơn thật cũng gặp đúng lỗi đó. Nhiều dòng sản phẩm = cùng ORDER ID = một đơn.
definePageMeta({
  middleware: [
    () => {
      if (!useAuthStore().isTechnician) return navigateTo('/no-access')
    },
  ],
})

const toast = useToastStore()

// Tên "file" ghi lên import job — nhìn lịch sử import là biết đơn nào tạo tay.
const SOURCE_NAME = 'Tạo đơn lẻ (kỹ thuật viên)'

const pad = (n: number) => String(n).padStart(2, '0')
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// ORDER ID mặc định có tiền tố TEST- để đơn test lộ ra ở mọi danh sách và trên tem.
function newTestOrderId(): string {
  const d = new Date()
  return `TEST-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

const sellers = ref<Seller[]>([])
const skus = ref<Sku[]>([])
// Gợi ý SKU: mã + tên sản phẩm (tên cũng được tìm khi gõ).
const skuOptions = computed(() => skus.value.map((s) => ({ value: s.code, sublabel: s.product_name || s.name || undefined })))
const sellerOptions = computed(() => sellers.value.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })))

onMounted(async () => {
  const [s, k] = await Promise.allSettled([sellersApi.list(), skusApi.list()])
  if (s.status === 'fulfilled') {
    sellers.value = s.value.data ?? []
    if (!order.sellerId && sellers.value.length) order.sellerId = sellers.value[0].id
  } else {
    toast.error('Không tải được danh sách seller: ' + errorMessage(s.reason))
  }
  if (k.status === 'fulfilled') skus.value = (k.value.data ?? []).filter((x) => x.is_active !== false)
})

// Địa chỉ mẫu điền sẵn để bấm tạo được ngay; sửa tuỳ ý khi cần test một trường hợp cụ thể.
const order = reactive({
  sellerId: null as number | null,
  storeOrderId: newTestOrderId(),
  shopName: 'Test shop',
  account: '',
  date: todayISO(),
  name: 'Test Customer',
  address1: '123 Test Street',
  address2: '',
  city: 'New York',
  region: 'NY',
  zip: '10001',
  country: 'US',
  phone: '2025550123',
  note: '',
})

interface ItemLine {
  sku: string
  quantity: number
  imageCode: string
  frontDesign: string
  backDesign: string
  mockup: string
  engrave: string
}
const blankItem = (): ItemLine => ({
  sku: '', quantity: 1, imageCode: '', frontDesign: '', backDesign: '', mockup: '', engrave: '',
})
const items = ref<ItemLine[]>([blankItem()])
function addItem() {
  items.value.push(blankItem())
}
function removeItem(i: number) {
  if (items.value.length > 1) items.value.splice(i, 1)
}

function toRows(): ImportRow[] {
  const head = {
    'ORDER ID': order.storeOrderId.trim(),
    'Shop name': order.shopName.trim(),
    Account: order.account.trim(),
    DATE: order.date,
    name: order.name.trim(),
    'Địa chỉ nhận': order.address1.trim(),
    'Địa chỉ nhận (Phụ)': order.address2.trim(),
    'Thành phố': order.city.trim(),
    'Mã vùng': order.region.trim(),
    Zipcode: order.zip.trim(),
    'Quốc Gia': order.country.trim(),
    ShippingPhone: order.phone.trim(),
    Note: order.note.trim(),
  }
  return items.value.map((it) => ({
    ...head,
    'MÃ SKU': it.sku.trim(),
    'SỐ LƯỢNG': it.quantity,
    'Mã ảnh (nếu có)': it.imageCode.trim(),
    'DESIGN ORDER': it.frontDesign.trim(),
    designBack: it.backDesign.trim(),
    Mockup: it.mockup.trim(),
    'EngraveText (if have)': it.engrave.trim(),
  }))
}

const creating = ref(false)
const formError = ref<string | null>(null)
const errors = ref<ImportError[]>([])
const warnings = ref<ImportError[]>([])
const created = ref<{ storeOrderId: string; count: number; orderId?: number; internalCode?: string } | null>(null)

async function submit() {
  if (creating.value) return
  formError.value = null
  errors.value = []
  warnings.value = []
  created.value = null
  if (!order.sellerId) {
    formError.value = 'Chọn seller trước.'
    return
  }
  creating.value = true
  try {
    const storeOrderId = order.storeOrderId.trim()
    const { data: p } = await importsApi.preview({
      seller_id: order.sellerId, commit: false, filename: SOURCE_NAME, rows: toRows(),
    })
    errors.value = p.errors ?? []
    warnings.value = p.warnings ?? []
    if (p.error_rows > 0 || p.valid_rows === 0) {
      toast.error('Đơn chưa được tạo — xem lỗi bên dưới')
      return
    }
    const { data: job } = await importsApi.commitJob(p.import_job_id)
    created.value = { storeOrderId, count: job.created_count ?? 0 }
    toast.success(`Đã tạo đơn ${storeOrderId} — đang ở Chờ duyệt`)
    void refreshActionCounts()
    // Tìm đơn vừa tạo để dẫn thẳng tới chi tiết. Không thấy cũng không sao: đơn đã tạo.
    try {
      const { data: found } = await ordersApi.list({ store_order_id: storeOrderId, page_size: 5 })
      const o = (found ?? []).sort((a, b) => b.id - a.id)[0]
      if (o && created.value) {
        created.value.orderId = o.id
        created.value.internalCode = o.internal_code
      }
    } catch { /* link là phụ */ }
  } catch (e) {
    formError.value = errorMessage(e)
  } finally {
    creating.value = false
  }
}

// Tạo tiếp một đơn: giữ người nhận + sản phẩm, chỉ đổi ORDER ID để không trùng.
function another() {
  order.storeOrderId = newTestOrderId()
  created.value = null
  errors.value = []
  warnings.value = []
  formError.value = null
}
</script>

<template>
  <div>
    <PageHeader title="Tạo đơn lẻ" subtitle="Công cụ test của kỹ thuật viên — đơn đi qua đúng luồng Import, vào Chờ duyệt như đơn thật">
      <template #actions>
        <NuxtLink to="/import" class="btn-secondary"><UiIcon name="upload" :size="16" /> Về Import</NuxtLink>
      </template>
    </PageHeader>

    <div
      class="mb-5 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <UiIcon name="alert" :size="18" class="mt-0.5 shrink-0" />
      <p>
        Đơn tạo ở đây là <b>đơn thật trong hệ thống</b> (xưởng thấy ở mọi danh sách). Giữ tiền tố <b>TEST-</b> ở ORDER ID cho dễ nhận.
        Đừng bấm <b>Gửi cho THE</b> với đơn test khi kết nối THE đang bật — THE sẽ tạo vận đơn thật và trừ ví.
        Test xong thì huỷ hoặc xoá đơn.
      </p>
    </div>

    <form class="grid grid-cols-1 gap-5 lg:grid-cols-3" @submit.prevent="submit">
      <!-- Thông tin đơn + người nhận -->
      <div class="card space-y-3 p-5 lg:col-span-1">
        <div>
          <label class="label">Seller</label>
          <UiSelect v-model="order.sellerId" :options="sellerOptions" searchable placeholder="Chọn seller…" aria-label="Seller" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label class="label" for="o-id">ORDER ID</label>
            <input id="o-id" v-model="order.storeOrderId" class="input font-mono" required />
          </div>
          <div>
            <label class="label" for="o-shop">Shop name</label>
            <input id="o-shop" v-model="order.shopName" class="input" />
          </div>
          <div>
            <label class="label" for="o-date">Ngày đơn</label>
            <input id="o-date" v-model="order.date" type="date" class="input" />
          </div>
          <div class="col-span-2">
            <label class="label" for="o-acc">Account (tuỳ chọn)</label>
            <input id="o-acc" v-model="order.account" class="input" />
          </div>
        </div>

        <p class="border-t border-border pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Người nhận</p>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label class="label" for="o-name">Tên</label>
            <input id="o-name" v-model="order.name" class="input" />
          </div>
          <div class="col-span-2">
            <label class="label" for="o-a1">Địa chỉ</label>
            <input id="o-a1" v-model="order.address1" class="input" />
          </div>
          <div class="col-span-2">
            <label class="label" for="o-a2">Địa chỉ (phụ)</label>
            <input id="o-a2" v-model="order.address2" class="input" />
          </div>
          <div>
            <label class="label" for="o-city">Thành phố</label>
            <input id="o-city" v-model="order.city" class="input" />
          </div>
          <div>
            <label class="label" for="o-region">Mã vùng</label>
            <input id="o-region" v-model="order.region" class="input" />
          </div>
          <div>
            <label class="label" for="o-zip">Zipcode</label>
            <input id="o-zip" v-model="order.zip" class="input" />
          </div>
          <div>
            <label class="label" for="o-country">Quốc gia</label>
            <input id="o-country" v-model="order.country" class="input" />
          </div>
          <div class="col-span-2">
            <label class="label" for="o-phone">Số điện thoại</label>
            <input id="o-phone" v-model="order.phone" class="input" />
          </div>
          <div class="col-span-2">
            <label class="label" for="o-note">Ghi chú đơn (hiện ở màn QC)</label>
            <textarea id="o-note" v-model="order.note" rows="2" class="input" />
          </div>
        </div>
      </div>

      <!-- Sản phẩm -->
      <div class="space-y-4 lg:col-span-2">
        <div v-for="(it, i) in items" :key="i" class="card p-5">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm font-semibold text-foreground">Sản phẩm {{ i + 1 }}</p>
            <button v-if="items.length > 1" type="button" class="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400" @click="removeItem(i)">
              Bỏ dòng này
            </button>
          </div>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="col-span-2">
              <label class="label" :for="`i-sku-${i}`">Mã SKU</label>
              <!-- Ô gõ tự do có gợi ý: gõ được cả SKU sai / chưa map NVL để test lỗi. -->
              <UiCombobox
                :id="`i-sku-${i}`"
                v-model="it.sku"
                :options="skuOptions"
                mono
                placeholder="Gõ mã hoặc tên SP…"
                free-text-hint="không có trong Master data — vẫn tạo được để test lỗi SKU"
              />
            </div>
            <div>
              <label class="label" :for="`i-qty-${i}`">Số lượng</label>
              <input :id="`i-qty-${i}`" v-model.number="it.quantity" type="number" min="0" class="input" />
            </div>
            <div>
              <label class="label" :for="`i-img-${i}`">Mã ảnh</label>
              <input :id="`i-img-${i}`" v-model="it.imageCode" class="input" />
            </div>
            <div class="col-span-2">
              <label class="label" :for="`i-front-${i}`">Design mặt trước (link)</label>
              <input :id="`i-front-${i}`" v-model="it.frontDesign" class="input" placeholder="https://…" />
            </div>
            <div class="col-span-2">
              <label class="label" :for="`i-back-${i}`">Design mặt sau (nếu in 2 mặt)</label>
              <input :id="`i-back-${i}`" v-model="it.backDesign" class="input" placeholder="https://…" />
            </div>
            <div class="col-span-2">
              <label class="label" :for="`i-mock-${i}`">Mockup (link ảnh)</label>
              <input :id="`i-mock-${i}`" v-model="it.mockup" class="input" placeholder="https://…" />
            </div>
            <div class="col-span-2">
              <label class="label" :for="`i-eng-${i}`">Nội dung khắc</label>
              <input :id="`i-eng-${i}`" v-model="it.engrave" class="input" />
            </div>
          </div>
        </div>

        <button type="button" class="btn-secondary w-full" @click="addItem">+ Thêm sản phẩm (cùng đơn)</button>

        <!-- Kết quả -->
        <p v-if="formError" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-rose-500/10 dark:text-rose-300">{{ formError }}</p>

        <div v-if="errors.length" class="card border-rose-300 p-4 dark:border-rose-500/40">
          <p class="mb-2 text-sm font-semibold text-rose-700 dark:text-rose-300">Đơn chưa tạo — {{ errors.length }} lỗi</p>
          <ul class="space-y-2 text-sm">
            <li v-for="(er, k) in errors" :key="k">
              <span class="font-medium text-foreground">Sản phẩm {{ er.row_number }}: {{ importErrorVi(er).label }}</span>
              <span class="text-muted-foreground"> — {{ importErrorVi(er).detail || er.message }}</span>
              <span v-if="importErrorVi(er).suggestion" class="block text-xs text-muted-foreground">{{ importErrorVi(er).suggestion }}</span>
            </li>
          </ul>
        </div>

        <div v-if="warnings.length" class="card border-amber-300 p-4 dark:border-amber-500/40">
          <p class="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-300">Lưu ý (không chặn tạo đơn)</p>
          <ul class="space-y-1 text-sm text-foreground">
            <li v-for="(w, k) in warnings" :key="k">{{ importErrorVi(w).label }} — {{ importErrorVi(w).detail || w.message }}</li>
          </ul>
        </div>

        <div v-if="created" class="card border-emerald-300 p-4 dark:border-emerald-500/40">
          <p class="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Đã tạo đơn {{ created.storeOrderId }}<template v-if="created.internalCode"> (mã nội bộ {{ created.internalCode }})</template>
          </p>
          <p class="mt-1 text-sm text-muted-foreground">Đơn đang ở <b>Chờ duyệt</b> — duyệt xong mới vào thiết kế / sản xuất như đơn thật.</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <NuxtLink v-if="created.orderId" :to="`/orders/${created.orderId}`" class="btn-secondary">Mở đơn</NuxtLink>
            <NuxtLink to="/review" class="btn-secondary">Tới Chờ duyệt</NuxtLink>
            <button type="button" class="btn-primary" @click="another">Tạo đơn khác</button>
          </div>
        </div>

        <button v-if="!created" type="submit" class="btn-primary w-full" :disabled="creating">
          <UiSpinner v-if="creating" :size="16" />
          {{ creating ? 'Đang tạo…' : 'Tạo đơn' }}
        </button>
      </div>
    </form>
  </div>
</template>
