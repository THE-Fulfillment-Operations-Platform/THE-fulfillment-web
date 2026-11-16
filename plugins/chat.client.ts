import { useAuthStore } from '~/stores/auth'
import { setChatNotificationOpener, unlockChatAudio, useChatStore } from '~/stores/chat'
import { setChatApiBase } from '~/services/api/chat'

// Chat nội bộ: mở MỘT kết nối WebSocket khi đăng nhập (dùng chung cho bong bóng,
// ô chat nhỏ và trang Tin nhắn), đóng khi đăng xuất / đổi tài khoản.
// Chạy sau auth.client.ts (thứ tự tên file) nên phiên đã được khôi phục.
export default defineNuxtPlugin(() => {
  setChatApiBase(useRuntimeConfig().public.apiBaseUrl as string)
  const auth = useAuthStore()
  const chat = useChatStore()
  const router = useRouter()

  watch(
    () => (auth.isAuthenticated ? auth.user?.id ?? 0 : 0),
    (id, prev) => {
      if (prev) chat.stop()
      if (id) void chat.start()
    },
    { immediate: true },
  )

  // Âm báo chỉ kêu khi KHÔNG ở trang Tin nhắn (ở đó danh sách đã hiện tin mới).
  const isChatPath = (p: string) => p === '/chat' || p === '/seller/chat'
  chat.onChatPage = isChatPath(router.currentRoute.value.path)
  router.afterEach((to) => {
    chat.onChatPage = isChatPath(to.path)
  })
  // Bấm vào thông báo trình duyệt: mở đúng cuộc trên trang Tin nhắn.
  setChatNotificationOpener((id) => {
    void router.push({ path: auth.isSeller ? '/seller/chat' : '/chat', query: { c: String(id) } })
  })
  // Trình duyệt chỉ cho phát âm sau một cú bấm của người dùng: mở khoá ở cú bấm đầu.
  window.addEventListener('pointerdown', unlockChatAudio, { once: true, capture: true })
  window.addEventListener('keydown', unlockChatAudio, { once: true, capture: true })

  window.addEventListener('online', () => chat.reconnectNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    chat.reconnectNow()
    if (chat.activeId) chat.maybeMarkRead(chat.activeId)
  })
})
