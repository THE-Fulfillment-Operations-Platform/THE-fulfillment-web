<script setup lang="ts">
// Hộp thoại huỷ dùng chung cho seller — cả màn danh sách lẫn màn chi tiết, cả
// huỷ cả đơn lẫn huỷ một sản phẩm. Gom về một chỗ vì phần khó không phải cái
// form mà là câu chữ: người bấm phải hiểu ngay huỷ bây giờ là mất tiền hay không.
const props = defineProps<{
  modelValue: boolean
  // 'cancel' = huỷ ngay (chưa sản xuất, miễn phí) · 'request' = xin duyệt.
  mode: 'cancel' | 'request'
  // Huỷ ở giai đoạn này có bị tính tiền không (BE quyết định, FE chỉ hiển thị).
  willBill?: boolean
  orderCode?: string
  // Có giá trị = đang huỷ đúng một sản phẩm; bỏ trống = huỷ cả đơn.
  itemLabel?: string | null
  saving?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'submit', reason: string): void
}>()

const reason = ref('')

// Mỗi lần mở lại là một lần huỷ khác — không để sót lý do của lần trước.
watch(
  () => props.modelValue,
  (open) => {
    if (open) reason.value = ''
  },
)

const title = computed(() => {
  if (props.itemLabel) return props.mode === 'cancel' ? 'Huỷ sản phẩm' : 'Yêu cầu huỷ sản phẩm'
  return props.mode === 'cancel' ? 'Huỷ đơn hàng' : 'Yêu cầu huỷ đơn'
})

// Đơn đã vào sản xuất thì vận hành cần biết vì sao mới quyết được, nên lý do là
// bắt buộc; huỷ tự do trước sản xuất thì không bắt.
const reasonRequired = computed(() => props.mode === 'request')
const canSubmit = computed(() => !props.saving && (!reasonRequired.value || reason.value.trim().length > 0))

function submit() {
  if (!canSubmit.value) return
  emit('submit', reason.value.trim())
}
</script>

<template>
  <UiModal :model-value="modelValue" :title="title" @update:model-value="emit('update:modelValue', $event)">
    <div class="space-y-3">
      <!-- Cảnh báo tính tiền: điều duy nhất người bấm phải đọc kỹ. -->
      <div
        v-if="willBill"
        class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
      >
        <UiIcon name="alert" :size="18" class="mt-0.5 shrink-0" />
        <div>
          <p class="font-semibold">Đơn đã vào sản xuất — huỷ vẫn bị tính tiền</p>
          <p class="mt-0.5 text-xs text-amber-700/90 dark:text-amber-300/90">
            Nguyên vật liệu và công sản xuất đã bỏ ra nên phần này vẫn được tính vào hoá đơn.
            Yêu cầu của bạn sẽ chuyển cho vận hành duyệt, đơn vẫn chạy tiếp cho tới khi có quyết định.
          </p>
        </div>
      </div>

      <p class="text-sm text-muted-foreground">
        <template v-if="itemLabel">
          <template v-if="mode === 'cancel'">
            Huỷ sản phẩm <span class="font-medium text-foreground">{{ itemLabel }}</span> khỏi đơn
            <span class="font-medium text-foreground">{{ orderCode }}</span>? Các sản phẩm còn lại vẫn được giữ.
            Thao tác này không thể hoàn tác.
          </template>
          <template v-else>
            Gửi yêu cầu huỷ sản phẩm <span class="font-medium text-foreground">{{ itemLabel }}</span> trong đơn
            <span class="font-medium text-foreground">{{ orderCode }}</span>. Vận hành sẽ xem xét và phản hồi.
          </template>
        </template>
        <template v-else>
          <template v-if="mode === 'cancel'">
            Huỷ toàn bộ đơn <span class="font-medium text-foreground">{{ orderCode }}</span> (tất cả sản phẩm bên trong)?
            Đơn chưa vào sản xuất nên không bị tính tiền. Thao tác này không thể hoàn tác.
          </template>
          <template v-else>
            Gửi yêu cầu huỷ toàn bộ đơn <span class="font-medium text-foreground">{{ orderCode }}</span>.
            Vận hành sẽ xem xét và phản hồi.
          </template>
        </template>
      </p>

      <div>
        <label class="label">Lý do <span v-if="reasonRequired" class="text-rose-500">*</span><span v-else> (tuỳ chọn)</span></label>
        <textarea
          v-model="reason"
          rows="3"
          class="input"
          :placeholder="reasonRequired ? 'Vì sao cần huỷ? Vận hành cần thông tin này để quyết định…' : 'Nhập lý do huỷ…'"
          @keyup.enter.ctrl="submit"
        />
      </div>
    </div>
    <template #footer>
      <button class="btn-secondary" @click="emit('update:modelValue', false)">Đóng</button>
      <button class="btn-primary" :disabled="!canSubmit" @click="submit">
        <UiSpinner v-if="saving" :size="16" /> {{ mode === 'cancel' ? 'Xác nhận huỷ' : 'Gửi yêu cầu' }}
      </button>
    </template>
  </UiModal>
</template>
