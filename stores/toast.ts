import { defineStore } from 'pinia'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  type: ToastType
  message: string
}

let counter = 0

export const useToastStore = defineStore('toast', {
  state: () => ({
    toasts: [] as Toast[],
  }),
  actions: {
    push(message: string, type: ToastType = 'info', timeout = 3500) {
      const id = ++counter
      this.toasts.push({ id, type, message })
      if (import.meta.client) {
        setTimeout(() => this.dismiss(id), timeout)
      }
    },
    success(message: string) {
      this.push(message, 'success')
    },
    error(message: string) {
      this.push(message, 'error', 5000)
    },
    info(message: string) {
      this.push(message, 'info')
    },
    dismiss(id: number) {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
  },
})
