<script setup lang="ts">
// Tải ZIP design mà không file nào tải được. Thay cho một toast dài bị cắt chữ:
// gom các link hỏng theo LÝ DO (thường cả batch hỏng cùng một kiểu, vd. dán link
// thư mục Drive), mỗi nhóm nói rõ cách sửa và liệt kê từng sản phẩm — bấm mã
// nội bộ là sang trang đơn để sửa link design.
import type { DesignDownloadFailure, DesignLinkFailure } from '~/utils/design-download-error'
import { useToastStore } from '~/stores/toast'

const props = defineProps<{
  modelValue: boolean
  failure: DesignDownloadFailure | null
  /** Đang tải cái gì, vd. "Batch #101068" — để đầu danh sách copy gửi đi. */
  source?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const toast = useToastStore()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const LABEL: Record<string, string> = {
  DRIVE_FOLDER: 'Link thư mục Drive',
  DRIVE_NOT_SHARED: 'Chưa chia sẻ công khai',
  GOOGLE_DOC: 'Tài liệu Google',
  WEB_PAGE: 'Link trang web',
  LINK_GONE: 'File không còn',
  LINK_FORBIDDEN: 'Bị chặn truy cập',
  TOO_LARGE: 'File quá lớn',
  BAD_URL: 'Link không hợp lệ',
  UNREACHABLE: 'Không kết nối được',
  HTTP_STATUS: 'Lỗi máy chủ chứa file',
  DOWNLOAD_FAILED: 'Tải bị gián đoạn',
}

const FIX: Record<string, string> = {
  DRIVE_FOLDER:
    'Mỗi sản phẩm cần link tới ĐÚNG MỘT file. Mở thư mục → chuột phải vào file design của sản phẩm → Chia sẻ → Sao chép đường liên kết, rồi dán vào link design của đúng sản phẩm đó.',
  DRIVE_NOT_SHARED:
    'Trên Google Drive: chuột phải vào file → Chia sẻ → Quyền truy cập chung → chọn "Bất kỳ ai có đường liên kết".',
  GOOGLE_DOC: 'Xuất design ra file (PNG, PDF, AI…), tải file đó lên Drive rồi dùng link của file.',
  WEB_PAGE: 'Dùng link trỏ thẳng tới file (mở ra là tải về được), không phải trang xem trước hay trang web.',
  LINK_GONE: 'File đã bị xoá hoặc đổi chỗ — lấy lại link mới của file.',
  LINK_FORBIDDEN: 'Nơi lưu file đang chặn truy cập — mở quyền xem công khai cho file hoặc dùng link khác.',
  TOO_LARGE: 'Giảm dung lượng file xuống dưới 100MB rồi cập nhật lại link.',
  BAD_URL: 'Link phải bắt đầu bằng http:// hoặc https:// và mở được từ Internet.',
}
const FIX_DEFAULT = 'Máy chủ chứa file không phản hồi đúng — thử tải lại sau ít phút; vẫn lỗi thì kiểm tra lại link.'

interface Group {
  key: string
  code: string
  reason: string
  rows: DesignLinkFailure[]
  /** Cả nhóm dùng chung MỘT link → hiện một lần thay vì lặp mỗi dòng. */
  sharedUrl: string | null
  /** Có sản phẩm 2 mặt → mới cần cột "Mặt", không thì cả cột chỉ toàn "—". */
  hasSides: boolean
}

// Nhóm theo mã + câu lý do (HTTP 404 và 500 cùng họ nhưng cách sửa khác nhau),
// nhóm đông nhất lên đầu — đó thường là thứ cần sửa trước.
const groups = computed<Group[]>(() => {
  const byKey = new Map<string, Group>()
  for (const f of props.failure?.failed ?? []) {
    const key = `${f.code}|${f.reason}`
    let g = byKey.get(key)
    if (!g) {
      g = { key, code: f.code, reason: f.reason, rows: [], sharedUrl: null, hasSides: false }
      byKey.set(key, g)
    }
    g.rows.push(f)
  }
  const out = [...byKey.values()]
  for (const g of out) {
    const first = g.rows[0]?.url ?? ''
    g.sharedUrl = g.rows.length > 1 && g.rows.every((r) => r.url === first) ? first : null
    g.hasSides = g.rows.some((r) => !!r.side)
  }
  return out.sort((a, b) => b.rows.length - a.rows.length)
})

const total = computed(() => props.failure?.failed.length ?? 0)

function sideLabel(side?: string): string {
  if (side === 'FRONT') return 'Mặt trước'
  if (side === 'BACK') return 'Mặt sau'
  return ''
}

/** Rút gọn URL để bảng không vỡ, vẫn giữ link đầy đủ ở href/title. */
function shortUrl(url: string): string {
  if (!url) return '—'
  return url.length > 42 ? `${url.slice(0, 26)}…${url.slice(-12)}` : url
}

// Văn bản gửi thẳng cho seller/designer: lý do, cách sửa và từng sản phẩm.
async function copyList() {
  const lines: string[] = [`${props.source ? `${props.source} — ` : ''}${total.value} link design không tải được`]
  for (const g of groups.value) {
    lines.push('', `[${g.rows.length}] ${g.reason}`, `Cách sửa: ${FIX[g.code] ?? FIX_DEFAULT}`)
    if (g.sharedUrl) lines.push(`Link đang dùng: ${g.sharedUrl}`)
    for (const r of g.rows) {
      const side = sideLabel(r.side)
      lines.push(`- ${r.internal_code} · ${r.sku}${side ? ` (${side.toLowerCase()})` : ''}${g.sharedUrl ? '' : ` · ${r.url}`}`)
    }
  }
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    toast.success('Đã copy danh sách link lỗi')
  } catch {
    toast.error('Không copy được — trình duyệt chặn clipboard')
  }
}
</script>

<template>
  <UiModal v-model="open" title="Không tải được file design" wide>
    <div v-if="failure" class="space-y-4">
      <div
        class="flex items-start gap-2.5 rounded-md border border-rose-200/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
      >
        <UiIcon name="alert" :size="16" class="mt-0.5 shrink-0" />
        <div>
          <p class="font-semibold">
            {{ total }} link design lỗi — không có file nào để tải
            <span v-if="source" class="font-normal opacity-80">· {{ source }}</span>
          </p>
          <p class="mt-0.5 text-xs opacity-90">
            Hệ thống không tạo file ZIP rỗng. Sửa link design của các sản phẩm bên dưới (bấm mã nội
            bộ để mở trang đơn) rồi bấm tải lại.
          </p>
        </div>
      </div>

      <section
        v-for="g in groups"
        :key="g.key"
        class="overflow-hidden rounded-lg border border-border"
      >
        <header class="space-y-2 bg-muted/60 px-3.5 py-3">
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="inline-flex items-center rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
            >{{ LABEL[g.code] ?? g.code }}</span>
            <span class="text-xs text-muted-foreground">{{ g.rows.length }} sản phẩm</span>
          </div>
          <p class="text-sm font-medium text-foreground">{{ g.reason }}</p>
          <div class="flex items-start gap-2 rounded-md bg-card px-3 py-2 text-xs text-muted-foreground">
            <UiIcon name="check" :size="14" class="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span><span class="font-medium text-foreground">Cách sửa:</span> {{ FIX[g.code] ?? FIX_DEFAULT }}</span>
          </div>
          <div v-if="g.sharedUrl" class="flex min-w-0 items-center gap-1.5 text-xs">
            <span class="shrink-0 text-muted-foreground">Cả nhóm đang dùng chung link:</span>
            <a
              :href="g.sharedUrl"
              target="_blank"
              rel="noopener"
              :title="g.sharedUrl"
              class="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
            >
              <UiIcon name="link" :size="12" class="shrink-0" />
              <span class="truncate">{{ shortUrl(g.sharedUrl) }}</span>
            </a>
          </div>
        </header>

        <div class="max-h-64 overflow-auto border-t border-border">
          <table class="min-w-full divide-y divide-border text-xs">
            <!-- Nền nằm trên <th> (không phải <thead>): bảng border-collapse không vẽ
                 nền nhóm hàng, dòng dữ liệu sẽ cuộn xuyên qua header dính-trên. -->
            <thead class="sticky top-0 z-10 [&_th]:bg-card">
              <tr>
                <th class="table-th">Mã nội bộ</th>
                <th class="table-th">SKU</th>
                <th v-if="g.hasSides" class="table-th">Mặt</th>
                <th v-if="!g.sharedUrl" class="table-th">Link design</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="(r, i) in g.rows" :key="`${r.internal_code}-${r.side ?? ''}-${i}`">
                <td class="table-td font-medium">
                  <NuxtLink
                    v-if="r.order_id"
                    :to="`/orders/${r.order_id}`"
                    target="_blank"
                    class="text-primary hover:underline"
                  >{{ r.internal_code }}</NuxtLink>
                  <span v-else class="text-foreground">{{ r.internal_code }}</span>
                </td>
                <td class="table-td text-foreground">{{ r.sku }}</td>
                <td v-if="g.hasSides" class="table-td text-muted-foreground">{{ sideLabel(r.side) || '—' }}</td>
                <td v-if="!g.sharedUrl" class="table-td">
                  <a
                    :href="r.url"
                    target="_blank"
                    rel="noopener"
                    :title="r.url"
                    class="text-primary hover:underline"
                  >{{ shortUrl(r.url) }}</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <template #footer>
      <button class="btn-secondary" @click="copyList">
        <UiIcon name="notes" :size="16" />
        Copy danh sách gửi seller
      </button>
      <button class="btn-primary" @click="open = false">Đóng</button>
    </template>
  </UiModal>
</template>
