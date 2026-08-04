import { usePwaInstall, isStandalone, type BeforeInstallPromptEvent } from '~/composables/usePwaInstall'

// PWA bootstrap (client-only):
//   1. Đăng ký service worker → app cài được vào màn hình chính và mở được khi
//      mạng chập chờn. CHỈ ở production: trong dev, file /_nuxt/* không có hash
//      nên cache-first của SW sẽ phục vụ code cũ sau mỗi lần sửa.
//   2. Giữ lại event `beforeinstallprompt` của Chromium. Trình duyệt bắn nó
//      ngay sau khi tải trang — sớm hơn lúc bất kỳ component nào mount — nên
//      phải bắt tại đây rồi cất vào state cho /install dùng.
export default defineNuxtPlugin(() => {
  const { deferred, installed } = usePwaInstall()

  installed.value = isStandalone()

  window.addEventListener('beforeinstallprompt', (e) => {
    // Chặn mini-infobar mặc định để tự quyết định hiển thị nút cài ở /install.
    e.preventDefault()
    deferred.value = e as BeforeInstallPromptEvent
  })

  window.addEventListener('appinstalled', () => {
    deferred.value = null
    installed.value = true
  })

  if (!('serviceWorker' in navigator)) return

  if (import.meta.dev) {
    // Dọn SW đã đăng ký trước đó trên cùng origin dev (ví dụ khi từng chạy bản
    // build production ở localhost) — nếu không, nó vẫn phục vụ bundle cũ.
    void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()))
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Có bản mới sau deploy → kích hoạt ngay thay vì chờ đóng hết tab.
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing
          if (!sw) return
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              sw.postMessage('SKIP_WAITING')
            }
          })
        })
      })
      .catch(() => {
        // Không đăng ký được (thiếu HTTPS, người dùng chặn…) — app vẫn chạy
        // bình thường như một web bình thường, chỉ mất phần cài đặt.
      })
  })
})
