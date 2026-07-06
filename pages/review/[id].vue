<script setup lang="ts">
import { reviewApi, itemsApi } from '~/services/api'
import type { ReviewOrderDetail, ReviewIssue, OrderItem } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { useToastStore } from '~/stores/toast'

// Review detail — inspect SKU/material mapping, mockup/design links, quantity,
// store/order info and shipping, normalize the production-ready fields, then
// approve / reject / request correction.
const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const id = route.params.id as string

const { data, loading, error, reload } = useApiResource<ReviewOrderDetail>(() => reviewApi.get(id))
const order = computed(() => data.value?.order ?? null)
const issues = computed<ReviewIssue[]>(() => data.value?.issues ?? [])
const blockers = computed(() => issues.value.filter((i) => i.severity === 'BLOCKER'))
const warnings = computed(() => issues.value.filter((i) => i.severity === 'WARNING'))

function issuesForItem(itemId: number) {
  return issues.value.filter((i) => i.item_id === itemId)
}

// ---- Production-ready field editor (Ops/Design normalization) --------------
// Ops/Design fill/edit the legacy production-template fields on each item here
// before approving. Material is derived from the SKU→material mapping (fix it in
// Master Data), so it is not edited per-item.
const editingItem = ref<number | null>(null)
const savingItem = ref(false)
const form = reactive({
  image_code: '',
  qc_description: '',
  production_sequence: '' as number | string,
  design_url: '',
  mockup_url: '',
  production_file_name: '',
  print_file_url: '',
  cut_file_url: '',
})

function openEditor(it: OrderItem) {
  editingItem.value = it.id
  form.image_code = it.image_code ?? ''
  form.qc_description = it.qc_description ?? ''
  form.production_sequence = it.production_sequence ?? ''
  form.design_url = it.design_url ?? ''
  form.mockup_url = it.mockup_url ?? ''
  form.production_file_name = it.production_file_name ?? ''
  form.print_file_url = it.print_file_url ?? ''
  form.cut_file_url = it.cut_file_url ?? ''
}
function closeEditor() {
  editingItem.value = null
}

async function saveProduction(itemId: number) {
  if (savingItem.value) return
  savingItem.value = true
  try {
    await itemsApi.patchDesign(itemId, {
      image_code: String(form.image_code).trim(),
      qc_description: form.qc_description.trim(),
      // Blank clears the sequence (model is a non-nullable int; 0 = unassigned),
      // consistent with how the text fields clear on blank.
      production_sequence: form.production_sequence === '' ? 0 : Number(form.production_sequence),
      design_url: form.design_url.trim(),
      mockup_url: form.mockup_url.trim(),
      production_file_name: form.production_file_name.trim(),
      print_file_url: form.print_file_url.trim(),
      cut_file_url: form.cut_file_url.trim(),
    })
    toast.success('Đã lưu dữ liệu sản xuất')
    editingItem.value = null
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    savingItem.value = false
  }
}

const note = ref('')
const busy = ref<'' | 'approve' | 'reject' | 'correction'>('')

async function doAction(kind: 'approve' | 'reject' | 'correction') {
  if (busy.value) return
  if (kind === 'reject' && !note.value.trim()) {
    toast.error('Vui lòng nhập lý do từ chối')
    return
  }
  if (kind === 'correction' && !note.value.trim()) {
    toast.error('Vui lòng mô tả nội dung cần chỉnh sửa')
    return
  }
  busy.value = kind
  try {
    if (kind === 'approve') await reviewApi.approve(id, note.value.trim() || undefined)
    else if (kind === 'reject') await reviewApi.reject(id, note.value.trim())
    else await reviewApi.requestCorrection(id, note.value.trim())
    toast.success(
      kind === 'approve' ? 'Đã duyệt đơn' : kind === 'reject' ? 'Đã từ chối đơn' : 'Đã gửi yêu cầu chỉnh sửa',
    )
    router.push('/review')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = ''
  }
}

const shippingRows = computed(() => {
  const o = order.value
  if (!o) return []
  return [
    ['Người nhận', o.shipping_name],
    ['Địa chỉ 1', o.shipping_address1],
    ['Địa chỉ 2', o.shipping_address2],
    ['Thành phố', o.shipping_city],
    ['Tỉnh/Bang', o.shipping_province],
    ['Mã bưu chính', o.shipping_zip],
    ['Quốc gia', o.shipping_country],
    ['Điện thoại', o.shipping_phone],
    ['Email', o.shipping_email],
    ['IOSS', o.ioss],
  ].filter(([, v]) => v) as [string, string][]
})
</script>

<template>
  <div>
    <div class="mb-4">
      <NuxtLink to="/review" class="text-sm text-primary hover:underline">← Về danh sách chờ duyệt</NuxtLink>
    </div>

    <UiStateBlock :loading="loading" :error="error" @retry="reload">
      <template v-if="order">
        <!-- Header -->
        <div class="card mb-5 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold text-foreground">{{ order.store_order_id }}</h1>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ order.internal_code }}
                <span class="mx-2">·</span>{{ order.seller?.name || order.seller?.code || '—' }}
                <span v-if="order.store_name" class="mx-2">·</span>{{ order.store_name }}
                <span class="mx-2">·</span>{{ formatDateTime(order.created_at) }}
              </p>
            </div>
            <UiStatusBadge kind="review" :value="order.review_status" />
          </div>
          <p v-if="order.review_note" class="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Ghi chú review gần nhất: {{ order.review_note }}
          </p>
        </div>

        <!-- Validation summary -->
        <div
          v-if="blockers.length"
          class="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10"
        >
          <p class="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
            <UiIcon name="alert" :size="16" /> {{ blockers.length }} lỗi chặn cần xử lý trước khi duyệt
          </p>
          <ul class="mt-2 list-disc space-y-1 pl-6 text-sm text-rose-700 dark:text-rose-300">
            <li v-for="(iss, idx) in blockers" :key="idx">
              <span v-if="iss.item_code" class="font-medium">{{ iss.item_code }}: </span>{{ iss.message }}
            </li>
          </ul>
        </div>
        <div
          v-else
          class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          <span class="inline-flex items-center gap-2"><UiIcon name="check" :size="16" /> Không có lỗi chặn — có thể duyệt.</span>
        </div>
        <div
          v-if="warnings.length"
          class="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10"
        >
          <p class="text-sm font-semibold text-amber-700 dark:text-amber-300">{{ warnings.length }} cảnh báo (không chặn)</p>
          <ul class="mt-2 list-disc space-y-1 pl-6 text-sm text-amber-700 dark:text-amber-300">
            <li v-for="(iss, idx) in warnings" :key="idx">
              <span v-if="iss.item_code" class="font-medium">{{ iss.item_code }}: </span>{{ iss.message }}
            </li>
          </ul>
        </div>

        <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <!-- Items -->
          <div class="space-y-4 lg:col-span-2">
            <div v-for="it in order.items ?? []" :key="it.id" class="card p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold text-foreground">
                    {{ it.sku_code }}
                    <span class="ml-2 text-xs font-normal text-muted-foreground">{{ it.internal_code }}</span>
                  </p>
                  <p class="text-sm text-muted-foreground">{{ it.product_name }} · SL {{ it.quantity }}</p>
                  <p v-if="it.engrave_text" class="mt-1 text-xs text-muted-foreground">Khắc: "{{ it.engrave_text }}"</p>
                </div>
                <UiStatusBadge kind="design" :value="it.design_status" />
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-sm">
                <UiMockupLink :url="it.mockup_url" label="Mockup seller" />
                <a v-if="it.design_url" :href="it.design_url" target="_blank" class="inline-flex items-center gap-1 text-primary hover:underline">
                  <UiIcon name="link" :size="14" /> Design
                </a>
                <span v-else class="text-xs text-muted-foreground">Design: chưa có</span>
              </div>

              <ul v-if="issuesForItem(it.id).length" class="mt-3 space-y-1">
                <li
                  v-for="(iss, idx) in issuesForItem(it.id)"
                  :key="idx"
                  class="flex items-center gap-1.5 text-xs"
                  :class="iss.severity === 'BLOCKER' ? 'text-rose-600 dark:text-rose-300' : 'text-amber-600 dark:text-amber-300'"
                >
                  <UiIcon name="alert" :size="12" /> {{ iss.message }}
                </li>
              </ul>

              <!-- Production-ready field editor -->
              <div class="mt-3 border-t border-border pt-3">
                <button
                  class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  @click="editingItem === it.id ? closeEditor() : openEditor(it)"
                >
                  <UiIcon :name="editingItem === it.id ? 'close' : 'design'" :size="13" />
                  {{ editingItem === it.id ? 'Đóng' : 'Chuẩn hoá dữ liệu sản xuất' }}
                </button>

                <div v-if="editingItem === it.id" class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label class="label">Mã ảnh</label>
                    <input v-model="form.image_code" class="input" placeholder="VD: IMG-9001" />
                  </div>
                  <div>
                    <label class="label">Số thứ tự</label>
                    <input v-model="form.production_sequence" type="number" min="0" class="input" placeholder="VD: 1" />
                  </div>
                  <div class="sm:col-span-2">
                    <label class="label">Mô tả SP để QC</label>
                    <textarea v-model="form.qc_description" rows="2" class="input" placeholder="Mô tả để QC đối chiếu…" />
                  </div>
                  <div>
                    <label class="label">Link ảnh / Design</label>
                    <input v-model="form.design_url" class="input" placeholder="https://…" />
                  </div>
                  <div>
                    <label class="label">Mockup</label>
                    <input v-model="form.mockup_url" class="input" placeholder="https://…" />
                  </div>
                  <div>
                    <label class="label">Tên file sản xuất</label>
                    <input v-model="form.production_file_name" class="input" placeholder="VD: wood-01.pdf" />
                  </div>
                  <div>
                    <label class="label">Link in</label>
                    <input v-model="form.print_file_url" class="input" placeholder="https://…" />
                  </div>
                  <div>
                    <label class="label">Link cắt</label>
                    <input v-model="form.cut_file_url" class="input" placeholder="https://…" />
                  </div>
                  <div class="flex items-end justify-end gap-2 sm:col-span-2">
                    <button class="btn-secondary text-xs" :disabled="savingItem" @click="closeEditor">Huỷ</button>
                    <button class="btn-primary text-xs" :disabled="savingItem" @click="saveProduction(it.id)">
                      <UiSpinner v-if="savingItem" :size="14" /> Lưu dữ liệu sản xuất
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Shipping + actions -->
          <div class="space-y-4">
            <div class="card p-4">
              <h3 class="mb-3 text-sm font-semibold text-foreground">Thông tin giao hàng</h3>
              <dl class="space-y-2 text-sm">
                <div v-for="[k, v] in shippingRows" :key="k" class="flex justify-between gap-3">
                  <dt class="shrink-0 text-muted-foreground">{{ k }}</dt>
                  <dd class="text-right font-medium text-foreground">{{ v }}</dd>
                </div>
              </dl>
            </div>

            <div class="card p-4">
              <h3 class="mb-2 text-sm font-semibold text-foreground">Quyết định review</h3>
              <label class="label">Ghi chú (bắt buộc khi từ chối / yêu cầu sửa)</label>
              <textarea v-model="note" rows="3" class="input" placeholder="Nhập ghi chú cho seller / nội bộ…" />
              <div class="mt-3 space-y-2">
                <button
                  class="btn-primary w-full"
                  :disabled="!!busy || blockers.length > 0"
                  :title="blockers.length ? 'Còn lỗi chặn, không thể duyệt' : ''"
                  @click="doAction('approve')"
                >
                  <UiSpinner v-if="busy === 'approve'" :size="16" /> Duyệt đơn
                </button>
                <button
                  class="btn-secondary w-full"
                  :disabled="!!busy"
                  @click="doAction('correction')"
                >
                  <UiSpinner v-if="busy === 'correction'" :size="16" /> Yêu cầu chỉnh sửa
                </button>
                <button
                  class="w-full rounded-md border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  :disabled="!!busy"
                  @click="doAction('reject')"
                >
                  <UiSpinner v-if="busy === 'reject'" :size="16" /> Từ chối đơn
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UiStateBlock>
  </div>
</template>
