import { ref } from 'vue'

/**
 * Promise-based confirmation dialog — a themed, accessible replacement for the
 * native window.confirm(). A single <ConfirmHost /> (mounted in app.vue) renders
 * the shared state; anywhere in the app you can:
 *
 *   if (!(await useConfirm().confirm({ title, message, tone: 'danger' }))) return
 *
 * The promise resolves true on accept, false on cancel / Escape / backdrop click.
 */
export type ConfirmTone = 'danger' | 'primary' | 'warning'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  tone?: ConfirmTone
  /** Danh sách chi tiết (mỗi phần tử một dòng), hiện căn trái trong khung cuộn
   *  dưới `message` — cho hộp xác nhận phải kể ra từng sản phẩm / SKU. Có nó thì
   *  hộp rộng hơn. */
  items?: string[]
}

interface ConfirmState {
  open: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
  tone: ConfirmTone
  items: string[]
}

const state = ref<ConfirmState>({
  open: false,
  title: 'Xác nhận',
  message: '',
  confirmText: 'Xác nhận',
  cancelText: 'Huỷ',
  tone: 'primary',
  items: [],
})
let resolver: ((v: boolean) => void) | null = null

export function useConfirm() {
  function confirm(opts: ConfirmOptions | string): Promise<boolean> {
    const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts
    // Resolve any dialog still open (shouldn't normally happen) as cancelled.
    resolver?.(false)
    state.value = {
      open: true,
      title: o.title ?? 'Xác nhận',
      message: o.message,
      confirmText: o.confirmText ?? 'Xác nhận',
      cancelText: o.cancelText ?? 'Huỷ',
      tone: o.tone ?? 'primary',
      items: o.items ?? [],
    }
    return new Promise<boolean>((resolve) => {
      resolver = resolve
    })
  }

  function settle(v: boolean) {
    if (!state.value.open) return
    state.value.open = false
    const r = resolver
    resolver = null
    r?.(v)
  }

  return {
    state,
    confirm,
    accept: () => settle(true),
    cancel: () => settle(false),
  }
}
