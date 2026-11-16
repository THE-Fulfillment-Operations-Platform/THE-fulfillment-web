import { useAuthStore } from '~/stores/auth'
import { useChatStore } from '~/stores/chat'
import { setChatApiBase } from '~/services/api/chat'

// Chat nội bộ: mở MỘT kết nối WebSocket khi đăng nhập (dùng chung cho bong bóng,
// ô chat nhỏ và trang Tin nhắn), đóng khi đăng xuất / đổi tài khoản.
// Chạy sau auth.client.ts (thứ tự tên file) nên phiên đã được khôi phục.
export default defineNuxtPlugin(() => {
  setChatApiBase(useRuntimeConfig().public.apiBaseUrl as string)
  const auth = useAuthStore()
  const chat = useChatStore()

  watch(
    () => (auth.isAuthenticated ? auth.user?.id ?? 0 : 0),
    (id, prev) => {
      if (prev) chat.stop()
      if (id) void chat.start()
    },
    { immediate: true },
  )

  window.addEventListener('online', () => chat.reconnectNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    chat.reconnectNow()
    if (chat.activeId) chat.maybeMarkRead(chat.activeId)
  })
})
