/**
 * Trạng thái cài PWA dùng chung cho toàn app.
 *
 * Chrome/Edge bắn `beforeinstallprompt` NGAY khi trang tải xong — sớm hơn lúc
 * component mount — nên listener phải nằm ở plugin (plugins/pwa.client.ts) và
 * cất event vào state này; component chỉ đọc lại. Safari/iOS không có API cài
 * đặt nào cả: ở đó chỉ còn cách hướng dẫn thao tác Chia sẻ → Thêm vào Màn hình
 * chính (xem pages/install.vue).
 */

/** Event của Chrome — chưa có trong lib DOM chuẩn. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type Platform = 'ios' | 'android' | 'desktop'

export function usePwaInstall() {
  // useState: chia sẻ một instance duy nhất giữa plugin và mọi component.
  const deferred = useState<BeforeInstallPromptEvent | null>('pwa:deferred', () => null)
  const installed = useState<boolean>('pwa:installed', () => false)

  /** Có nút "Cài đặt" bấm được không (chỉ Chromium). */
  const canPrompt = computed(() => deferred.value !== null)

  /**
   * Gọi hộp thoại cài của trình duyệt. Trả về true nếu người dùng đồng ý.
   * Event chỉ dùng được MỘT lần → xoá sau khi prompt dù kết quả thế nào.
   */
  async function promptInstall(): Promise<boolean> {
    const e = deferred.value
    if (!e) return false
    try {
      await e.prompt()
      const { outcome } = await e.userChoice
      deferred.value = null
      return outcome === 'accepted'
    } catch {
      deferred.value = null
      return false
    }
  }

  // `deferred` lộ ra ngoài để plugin gán event bắt được lúc khởi động.
  return { deferred, canPrompt, promptInstall, installed }
}

/** Đang chạy dưới dạng app đã cài (khung standalone), không phải tab trình duyệt. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // Safari/iOS không hỗ trợ display-mode cho tới iOS 16.4 → còn cờ riêng này.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** Nhận diện nền tảng để chọn đúng hướng dẫn cài. */
export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  // iPadOS 13+ giả dạng Mac → phân biệt bằng khả năng cảm ứng.
  const isIpadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(ua) || isIpadOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

/**
 * Trình duyệt nhúng trong app khác (Zalo, Messenger, Facebook, TikTok,
 * Instagram, Line…). Các webview này KHÔNG có menu Chia sẻ → Thêm vào Màn hình
 * chính, nên phải bảo người dùng mở link bằng Safari/Chrome trước.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Zalo|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok|BytedanceWebview|Snapchat|Twitter/i.test(ua)
}

/** Safari thật trên iOS (không phải Chrome/Firefox/Edge iOS — các bản này không cài được). */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return detectPlatform() === 'ios' && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) && !isInAppBrowser()
}
