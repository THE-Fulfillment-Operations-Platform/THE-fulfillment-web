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
  </div>
</template>
