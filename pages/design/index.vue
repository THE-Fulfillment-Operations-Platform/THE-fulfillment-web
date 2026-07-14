<script setup lang="ts">
import { designApi, itemsApi } from '~/services/api'
import type { OrderItem } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { errorMessage } from '~/utils/api-error'
import { isValidUrl } from '~/utils/format'
import { useToastStore } from '~/stores/toast'

const toast = useToastStore()
const { data, loading, error, reload } = useApiResource<OrderItem[]>(() => designApi.queue())
const items = computed(() => data.value ?? [])

const selected = ref<OrderItem | null>(null)
const form = reactive({ mockup_url: '', print_file_url: '', cut_file_url: '', design_url: '' })
const saving = ref(false)
const settingReady = ref(false)

function select(it: OrderItem) {
  selected.value = it
  form.mockup_url = it.mockup_url ?? ''
  form.print_file_url = it.print_file_url ?? ''
  form.cut_file_url = it.cut_file_url ?? ''
  form.design_url = it.design_url ?? ''
}

const canSetReady = computed(
  () => isValidUrl(form.mockup_url) && isValidUrl(form.print_file_url),
)

const validMockupUrl = computed(() => isValidUrl(form.mockup_url))
const validDesignUrl = computed(() => isValidUrl(form.design_url))
const validPrintUrl = computed(() => isValidUrl(form.print_file_url))
const validCutUrl = computed(() => isValidUrl(form.cut_file_url))

function downloadAsset(url: string, filename?: string) {
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  if (filename) a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// ---- Bulk ZIP download (design + mockup, one folder per internal code) ------
const zipOpen = ref(false)
const zipMode = ref<'all' | 'select'>('all')
const zipSelected = ref<Set<number>>(new Set())
const downloadingZip = ref(false)

// Only items that actually have a mockup or design file are worth bundling — the
// rest would produce empty folders, so we hide them from the picker.
const downloadableItems = computed(() =>
  items.value.filter((it) => it.mockup_url || it.design_url),
)

function openZipDialog() {
  zipMode.value = 'all'
  zipSelected.value = new Set()
  zipOpen.value = true
}

function toggleZipItem(id: number) {
  const next = new Set(zipSelected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  zipSelected.value = next
}

const allSelected = computed(
  () =>
    downloadableItems.value.length > 0 &&
    downloadableItems.value.every((it) => zipSelected.value.has(it.id)),
)
function toggleSelectAll() {
  zipSelected.value = allSelected.value
    ? new Set()
    : new Set(downloadableItems.value.map((it) => it.id))
}

const canDownloadZip = computed(() =>
  zipMode.value === 'all' ? downloadableItems.value.length > 0 : zipSelected.value.size > 0,
)

async function downloadZip() {
  if (!canDownloadZip.value || downloadingZip.value) return
  downloadingZip.value = true
  try {
    const ids = zipMode.value === 'select' ? Array.from(zipSelected.value) : undefined
    await designApi.downloadAssetsZip(ids)
    toast.success('Đang tải file ZIP…')
    zipOpen.value = false
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloadingZip.value = false
  }
}

async function save() {
  if (!selected.value) return
  saving.value = true
  try {
    const { data: updated } = await itemsApi.patchDesign(selected.value.id, {
      mockup_url: form.mockup_url || undefined,
      print_file_url: form.print_file_url || undefined,
      cut_file_url: form.cut_file_url || undefined,
      design_url: form.design_url || undefined,
    })
    toast.success('Đã lưu thông tin design')
    selected.value = updated
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function setReady() {
  if (!selected.value) return
  settingReady.value = true
  try {
    await itemsApi.patchDesign(selected.value.id, {
      mockup_url: form.mockup_url || undefined,
      print_file_url: form.print_file_url || undefined,
      cut_file_url: form.cut_file_url || undefined,
      set_ready: true,
    })
    toast.success('Item đã sẵn sàng sản xuất')
    selected.value = null
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    settingReady.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Design Queue"
      subtitle="Designer làm file in/cắt, lưu Mockup URL và tạo batch sản xuất"
    >
      <template #actions>
        <button class="btn-secondary" @click="openZipDialog">
          <UiIcon name="download" :size="16" /> Tải ZIP design
        </button>
        <NuxtLink to="/batches/new" class="btn-primary">
          <UiIcon name="plus" :size="16" /> Tạo batch
        </NuxtLink>
      </template>
    </PageHeader>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <!-- Queue list -->
      <div class="card overflow-hidden lg:col-span-2">
        <UiStateBlock
          :loading="loading"
          :error="error"
          :empty="!loading && !error && items.length === 0"
          empty-text="Không có item nào cần design."
          @retry="reload"
        >
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-border">
              <thead class="bg-muted">
                <tr>
                  <th class="table-th">Item</th>
                  <th class="table-th">SKU</th>
                  <th class="table-th">Mockup</th>
                  <th class="table-th">Assets</th>
                  <th class="table-th">Trạng thái</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr
                  v-for="it in items"
                  :key="it.id"
                  class="cursor-pointer hover:bg-muted"
                  :class="selected?.id === it.id ? 'bg-accent' : ''"
                  @click="select(it)"
                >
                  <td class="table-td font-medium text-foreground">{{ it.internal_code }}</td>
                  <td class="table-td">{{ it.sku_code }}</td>
                  <td class="table-td"><UiMockupLink :url="it.mockup_url" small label="Mockup" /></td>
                  <td class="table-td text-xs text-muted-foreground">
                    {{ it.print_file_url ? 'In ✓' : 'In ✗' }} · {{ it.cut_file_url ? 'Cắt ✓' : 'Cắt ✗' }}
                  </td>
                  <td class="table-td"><UiStatusBadge kind="design" :value="it.design_status" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiStateBlock>
      </div>

      <!-- Side panel -->
      <div class="card p-5">
        <h3 class="mb-1 text-sm font-semibold text-foreground">Design panel</h3>
        <p v-if="!selected" class="py-10 text-center text-sm text-muted-foreground">
          Chọn một item bên trái để chỉnh sửa.
        </p>
        <div v-else class="space-y-3">
          <div class="rounded-md bg-muted p-3 text-sm">
            <p class="font-medium text-foreground">{{ selected.internal_code }}</p>
            <p class="text-muted-foreground">{{ selected.sku_code }} · {{ selected.product_name }}</p>
          </div>

          <UiMockupLink :url="form.mockup_url" label="Mở mockup seller" />

          <div>
            <label class="label">Mockup URL</label>
            <input v-model="form.mockup_url" class="input" placeholder="https://…" />
          </div>
          <div>
            <label class="label">Print file URL</label>
            <input v-model="form.print_file_url" class="input" placeholder="https://…" />
          </div>
          <div>
            <label class="label">Cut file URL</label>
            <input v-model="form.cut_file_url" class="input" placeholder="https://…" />
          </div>
          <div>
            <label class="label">Design URL (tuỳ chọn)</label>
            <input v-model="form.design_url" class="input" placeholder="https://…" />
          </div>

          <p class="text-[11px] text-muted-foreground">
            MVP chưa có endpoint upload binary — upload file lên storage rồi dán URL vào đây.
          </p>

          <div class="space-y-2 rounded-md border border-border bg-slate-50 p-3 dark:bg-slate-900">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Mở file</p>
              <span class="text-xs text-muted-foreground">Mã nội bộ {{ selected.internal_code }}</span>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <button
                class="btn-secondary"
                :disabled="!validMockupUrl"
                @click="downloadAsset(form.mockup_url, `${selected.internal_code}-mockup`)">
                <UiIcon name="link" :size="16" /> Mockup
              </button>
              <button
                class="btn-secondary"
                :disabled="!validDesignUrl"
                @click="downloadAsset(form.design_url, `${selected.internal_code}-design`)">
                <UiIcon name="link" :size="16" /> Design
              </button>
              <button
                class="btn-secondary"
                :disabled="!validPrintUrl"
                @click="downloadAsset(form.print_file_url, `${selected.internal_code}-print`)">
                <UiIcon name="link" :size="16" /> File in
              </button>
              <button
                class="btn-secondary"
                :disabled="!validCutUrl"
                @click="downloadAsset(form.cut_file_url, `${selected.internal_code}-cut`)">
                <UiIcon name="link" :size="16" /> File cắt
              </button>
            </div>
            <p class="text-xs text-muted-foreground">
              Mở nhanh từng file của item đang chọn. Cần tải hàng loạt về máy? Dùng
              <b>Tải ZIP design</b> ở góc trên.
            </p>
          </div>

          <div class="flex flex-col gap-2 pt-1">
            <button class="btn-secondary" :disabled="saving" @click="save">
              <UiSpinner v-if="saving" :size="16" /> Lưu thay đổi
            </button>
            <button
              class="btn-success"
              :disabled="!canSetReady || settingReady"
              :title="!canSetReady ? 'Cần Mockup URL và Print file URL hợp lệ' : ''"
              @click="setReady"
            >
              <UiSpinner v-if="settingReady" :size="16" /> Set design ready
            </button>
            <NuxtLink to="/batches/new" class="btn-primary justify-center">
              <UiIcon name="batches" :size="16" /> Tạo production batch
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <!-- Bulk ZIP download dialog -->
    <UiModal v-model="zipOpen" title="Tải ZIP file design + mockup">
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          File nén gồm mỗi đơn một thư mục theo <b>mã nội bộ</b>, bên trong là file
          design và file mockup của đơn đó.
        </p>

        <div class="space-y-2">
          <label
            class="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3"
            :class="zipMode === 'all' ? 'bg-accent' : 'hover:bg-muted'"
          >
            <input
              v-model="zipMode"
              type="radio"
              value="all"
              class="mt-0.5 h-4 w-4 accent-primary"
            />
            <span class="text-sm">
              <span class="font-medium text-foreground">Tải toàn bộ hàng đợi</span>
              <span class="block text-muted-foreground">
                Tất cả đơn đang chờ design có sẵn file mockup/design.
              </span>
            </span>
          </label>

          <label
            class="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3"
            :class="zipMode === 'select' ? 'bg-accent' : 'hover:bg-muted'"
          >
            <input
              v-model="zipMode"
              type="radio"
              value="select"
              class="mt-0.5 h-4 w-4 accent-primary"
            />
            <span class="text-sm">
              <span class="font-medium text-foreground">Chọn từng đơn</span>
              <span class="block text-muted-foreground">
                Tick những đơn muốn tải bên dưới.
              </span>
            </span>
          </label>
        </div>

        <div v-if="zipMode === 'select'" class="space-y-2">
          <div class="flex items-center justify-between">
            <button class="text-xs font-medium text-primary hover:underline" @click="toggleSelectAll">
              {{ allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả' }}
            </button>
            <span class="text-xs text-muted-foreground">Đã chọn {{ zipSelected.size }}</span>
          </div>
          <div class="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
            <p
              v-if="downloadableItems.length === 0"
              class="px-3 py-6 text-center text-sm text-muted-foreground"
            >
              Chưa có đơn nào trong hàng đợi có file để tải.
            </p>
            <label
              v-for="it in downloadableItems"
              :key="it.id"
              class="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted"
            >
              <input
                type="checkbox"
                class="h-4 w-4 accent-primary"
                :checked="zipSelected.has(it.id)"
                @change="toggleZipItem(it.id)"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-foreground">
                  {{ it.internal_code }}
                </span>
                <span class="block truncate text-xs text-muted-foreground">
                  {{ it.sku_code }} · {{ it.mockup_url ? 'mockup ✓' : 'mockup ✗' }} ·
                  {{ it.design_url ? 'design ✓' : 'design ✗' }}
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <template #footer>
        <button class="btn-secondary" @click="zipOpen = false">Huỷ</button>
        <button
          class="btn-primary"
          :disabled="!canDownloadZip || downloadingZip"
          @click="downloadZip"
        >
          <UiSpinner v-if="downloadingZip" :size="16" />
          <UiIcon v-else name="download" :size="16" /> Tải ZIP
        </button>
      </template>
    </UiModal>
  </div>
</template>
