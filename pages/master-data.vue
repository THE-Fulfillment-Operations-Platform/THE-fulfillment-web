<script setup lang="ts">
import { materialsApi, skusApi, sellersApi } from '~/services/api'
import type { Material, Sku, Seller } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'

// Master Data / SKU-NVL Setup. Single page with four tabs (MVP): Materials, SKUs,
// SKU → Material mapping, and legacy Excel import. The catalog is loaded once here
// and shared with every tab so a create/import in one reflects across the others.
const route = useRoute()
const router = useRouter()

type TabKey = 'materials' | 'skus' | 'mapping' | 'sellers' | 'import'
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'materials', label: 'Materials', icon: 'box' },
  { key: 'skus', label: 'SKUs', icon: 'orders' },
  { key: 'mapping', label: 'SKU → Material', icon: 'link' },
  { key: 'sellers', label: 'Seller', icon: 'users' },
  { key: 'import', label: 'Import Excel vận hành cũ', icon: 'upload' },
]

const VALID: TabKey[] = ['materials', 'skus', 'mapping', 'sellers', 'import']
const tab = ref<TabKey>(VALID.includes(route.query.tab as TabKey) ? (route.query.tab as TabKey) : 'materials')
watch(tab, (t) => router.replace({ query: { ...route.query, tab: t } }))

const materials = ref<Material[]>([])
const skus = ref<Sku[]>([])
const sellers = ref<Seller[]>([])
const loadingMaterials = ref(false)
const loadingSkus = ref(false)
const loadingSellers = ref(false)

async function loadMaterials() {
  loadingMaterials.value = true
  try {
    materials.value = (await materialsApi.list()).data ?? []
  } catch (e) {
    useToastStore().error(errorMessage(e))
  } finally {
    loadingMaterials.value = false
  }
}
async function loadSkus() {
  loadingSkus.value = true
  try {
    skus.value = (await skusApi.list()).data ?? []
  } catch (e) {
    useToastStore().error(errorMessage(e))
  } finally {
    loadingSkus.value = false
  }
}
async function loadSellers() {
  loadingSellers.value = true
  try {
    sellers.value = (await sellersApi.list()).data ?? []
  } catch (e) {
    useToastStore().error(errorMessage(e))
  } finally {
    loadingSellers.value = false
  }
}
function reloadAll() {
  loadMaterials()
  loadSkus()
  loadSellers()
}
onMounted(reloadAll)

const unmappedCount = computed(() => skus.value.filter((s) => !(s.materials && s.materials.length)).length)
</script>

<template>
  <div>
    <PageHeader
      title="Master Data / SKU–NVL Setup"
      subtitle="Khai báo nguyên vật liệu, SKU và mapping SKU → nguyên vật liệu — nền tảng để gom batch và import đơn"
    >
      <template #actions>
        <NuxtLink to="/import" class="btn-secondary"><UiIcon name="upload" :size="16" /> Import đơn</NuxtLink>
      </template>
    </PageHeader>

    <!-- Tabs -->
    <div class="mb-4 flex flex-wrap gap-1 border-b border-border">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="relative -mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors"
        :class="tab === t.key
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="tab = t.key"
      >
        <UiIcon :name="t.icon" :size="16" />
        {{ t.label }}
        <span
          v-if="t.key === 'mapping' && unmappedCount > 0"
          class="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-100 px-1.5 text-[11px] font-semibold text-rose-600 dark:bg-rose-500/20 dark:text-rose-300"
        >
          {{ unmappedCount }}
        </span>
      </button>
    </div>

    <MasterDataMaterialsTab
      v-if="tab === 'materials'"
      :materials="materials"
      :loading="loadingMaterials"
      @changed="reloadAll"
    />
    <MasterDataSkusTab
      v-else-if="tab === 'skus'"
      :skus="skus"
      :materials="materials"
      :loading="loadingSkus"
      @changed="reloadAll"
    />
    <MasterDataMappingTab
      v-else-if="tab === 'mapping'"
      :skus="skus"
      :materials="materials"
      :loading="loadingSkus"
      @changed="reloadAll"
    />
    <MasterDataSellersTab
      v-else-if="tab === 'sellers'"
      :sellers="sellers"
      :loading="loadingSellers"
      @changed="reloadAll"
    />
    <MasterDataLegacyImportTab v-else @committed="reloadAll" />
  </div>
</template>
