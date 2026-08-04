<script setup lang="ts">
import { useToastStore } from '~/stores/toast'
import {
  usePwaInstall,
  detectPlatform,
  isStandalone,
  isInAppBrowser,
  isIosSafari,
  type Platform,
} from '~/composables/usePwaInstall'

// Trang công khai (xem middleware/auth.global.ts) — hướng dẫn cài web app này
// vào màn hình chính điện thoại. Dùng chung cho 2 lối vào:
//   • quét QR dán ở xưởng → mở thẳng trang này trên điện thoại;
//   • bấm link "Cài app" ở màn đăng nhập / menu.
//
// Lưu ý nền tảng: chỉ Chromium (Android, Chrome/Edge desktop) mới có API cài
// đặt thật (`beforeinstallprompt`). iOS/Safari KHÔNG có — Apple bắt người dùng
// tự bấm Chia sẻ → Thêm vào Màn hình chính, nên phần lớn trang này là hướng dẫn.
definePageMeta({ layout: 'public' })
useHead({ title: 'Cài app vào màn hình chính — BGDecor Fulfillment' })

const toast = useToastStore()
const { canPrompt, promptInstall, installed } = usePwaInstall()

// Link đưa vào QR / nút chia sẻ luôn là domain công khai (runtimeConfig), không
// phải origin đang mở: QR in ra từ máy dev mà ghi localhost thì quét vô nghĩa.
const appOrigin = (useRuntimeConfig().public.appBaseUrl as string).replace(/\/+$/, '')

const platform = ref<Platform>('desktop')
const inApp = ref(false)
const iosSafari = ref(false)
const appUrl = ref('')
const qrDataUrl = ref('')
const installing = ref(false)
const canShare = ref(false)

onMounted(async () => {
  platform.value = detectPlatform()
  inApp.value = isInAppBrowser()
  iosSafari.value = isIosSafari()
  installed.value = isStandalone()
  canShare.value = typeof navigator !== 'undefined' && !!navigator.share
  // QR trỏ về chính trang này trên domain thật: người quét sẽ thấy đúng hướng
  // dẫn cho máy họ.
  appUrl.value = `${appOrigin}/install`
  try {
    const QRCode = (await import('qrcode')).default
    qrDataUrl.value = await QRCode.toDataURL(appUrl.value, { margin: 1, width: 512 })
  } catch {
    /* QR là phụ trợ — không có thì vẫn còn link để copy */
  }
})

async function install() {
  installing.value = true
  try {
    const ok = await promptInstall()
    if (ok) toast.success('Đã thêm app vào màn hình chính.')
  } finally {
    installing.value = false
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(appUrl.value)
    toast.success('Đã sao chép link.')
  } catch {
    toast.error('Không sao chép được. Hãy copy thủ công: ' + appUrl.value)
  }
}

async function share() {
  try {
    await navigator.share({ title: 'BGDecor Fulfillment', url: appUrl.value })
  } catch {
    /* người dùng huỷ hộp thoại chia sẻ — không phải lỗi */
  }
}

/**
 * In tờ QR khổ A5 để dán ở xưởng. Mở cửa sổ TRƯỚC mọi await (giống trang batch)
 * để trình duyệt không coi là popup tự bung và chặn mất.
 */
function printPoster() {
  const w = window.open('', '_blank')
  if (!w) {
    toast.error('Trình duyệt chặn cửa sổ in. Hãy cho phép popup rồi thử lại.')
    return
  }
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
    <title>QR cài app BGDecor Fulfillment</title>
    <style>
      @page { size: A5; margin: 12mm; }
      body { margin: 0; font-family: Inter, system-ui, sans-serif; color: #111; text-align: center; }
      .logo { width: 64px; height: 64px; border-radius: 14px; }
      h1 { font-size: 20px; margin: 10px 0 2px; }
      .sub { font-size: 13px; color: #555; margin: 0 0 14px; }
      .qr { width: 260px; height: 260px; }
      .url { font-family: ui-monospace, monospace; font-size: 13px; margin-top: 8px; word-break: break-all; }
      ol { text-align: left; display: inline-block; margin: 16px auto 0; padding-left: 18px; font-size: 13px; line-height: 1.7; }
    </style></head><body>
      <img class="logo" src="${window.location.origin}/pwa-192.png" alt="" />
      <h1>BGDecor Fulfillment</h1>
      <p class="sub">Quét QR để cài app vào màn hình chính điện thoại</p>
      ${qrDataUrl.value ? `<img class="qr" src="${qrDataUrl.value}" alt="QR" />` : ''}
      <div class="url">${appUrl.value}</div>
      <ol>
        <li>Mở camera điện thoại, quét mã QR ở trên.</li>
        <li>Bấm mở link (iPhone nhớ mở bằng <b>Safari</b>, Android bằng <b>Chrome</b>).</li>
        <li>Làm theo hướng dẫn trên màn hình để thêm app vào màn hình chính.</li>
        <li>Mở app lên và đăng nhập bằng tài khoản được cấp.</li>
      </ol>
    </body></html>`
  w.document.write(html)
  w.document.close()
  // Chờ ảnh QR/logo tải xong rồi mới in, tránh in ra tờ trắng.
  w.onload = () => {
    w.focus()
    w.print()
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Đầu trang -->
    <div class="card p-6 text-center shadow-soft">
      <div class="mb-4 flex justify-center">
        <AppLogo variant="mark" />
      </div>
      <h1 class="text-lg font-semibold text-foreground">Cài app vào màn hình chính</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Thêm BGDecor Fulfillment như một ứng dụng: mở nhanh, chạy toàn màn hình, không thanh địa chỉ.
      </p>

      <!-- Đã cài rồi -->
      <div
        v-if="installed"
        class="mt-5 rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-foreground"
      >
        <p class="font-medium">Bạn đang mở bằng app đã cài — không cần làm gì thêm.</p>
        <NuxtLink to="/" class="btn-primary mt-3">Vào hệ thống</NuxtLink>
      </div>

      <!-- Nút cài thật (Android / Chrome, Edge desktop) -->
      <button v-else-if="canPrompt" class="btn-primary mt-5 w-full py-3" :disabled="installing" @click="install">
        <UiSpinner v-if="installing" :size="16" />
        {{ installing ? 'Đang cài…' : 'Cài app ngay' }}
      </button>
    </div>

    <!-- Cảnh báo trình duyệt trong app (Zalo, Messenger, TikTok…) -->
    <div v-if="!installed && inApp" class="card border-warning/40 bg-warning/10 p-4 text-sm shadow-soft">
      <p class="font-medium text-foreground">Bạn đang mở link trong ứng dụng khác (Zalo/Facebook…)</p>
      <p class="mt-1 text-muted-foreground">
        Trình duyệt này không cài được app. Bấm nút <b>…</b> ở góc màn hình rồi chọn
        <b>Mở bằng Safari</b> (iPhone) hoặc <b>Mở bằng Chrome</b> (Android), sau đó quay lại trang này.
      </p>
      <button class="btn-secondary mt-3" @click="copyLink">Sao chép link để dán vào trình duyệt</button>
    </div>

    <!-- Hướng dẫn iPhone / iPad -->
    <div v-if="!installed && platform === 'ios' && !inApp" class="card p-5 shadow-soft">
      <h2 class="mb-3 text-sm font-semibold text-foreground">iPhone / iPad</h2>

      <p v-if="!iosSafari" class="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-foreground">
        Trên iPhone chỉ <b>Safari</b> mới thêm được app vào màn hình chính. Hãy mở link này bằng Safari rồi làm 3 bước dưới.
      </p>

      <ol class="space-y-3 text-sm text-foreground">
        <li class="flex gap-3">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>
          <span class="flex flex-wrap items-center gap-1.5">
            Bấm nút Chia sẻ
            <svg class="inline-block h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 15V3m0 0L8.5 6.5M12 3l3.5 3.5" />
              <path d="M6 12v7a2 2 0 002 2h8a2 2 0 002-2v-7" />
            </svg>
            ở thanh dưới (hoặc góc trên) của Safari.
          </span>
        </li>
        <li class="flex gap-3">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>
          <span>
            Vuốt xuống, chọn
            <b class="whitespace-nowrap">Thêm vào Màn hình chính</b>
            <span class="text-muted-foreground"> (Add to Home Screen)</span>.
          </span>
        </li>
        <li class="flex gap-3">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">3</span>
          <span>Bấm <b>Thêm</b> ở góc phải. Icon app sẽ xuất hiện ngoài màn hình chính.</span>
        </li>
      </ol>
    </div>

    <!-- Hướng dẫn Android (khi trình duyệt không tự bật được nút cài) -->
    <div v-if="!installed && platform === 'android' && !inApp && !canPrompt" class="card p-5 shadow-soft">
      <h2 class="mb-3 text-sm font-semibold text-foreground">Android</h2>
      <ol class="space-y-3 text-sm text-foreground">
        <li class="flex gap-3">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>
          <span>Mở trang này bằng <b>Chrome</b>.</span>
        </li>
        <li class="flex gap-3">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>
          <span>Bấm nút <b>⋮</b> ở góc trên bên phải.</span>
        </li>
        <li class="flex gap-3">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">3</span>
          <span>Chọn <b>Cài đặt ứng dụng</b> hoặc <b>Thêm vào Màn hình chính</b> → <b>Cài đặt</b>.</span>
        </li>
      </ol>
    </div>

    <!-- Máy tính: quét QR bằng điện thoại -->
    <div v-if="!installed && platform === 'desktop'" class="card p-5 shadow-soft">
      <h2 class="mb-1 text-sm font-semibold text-foreground">Đang xem trên máy tính?</h2>
      <p class="text-sm text-muted-foreground">
        Dùng camera điện thoại quét mã QR bên dưới để mở trang này trên máy đó, rồi làm theo hướng dẫn hiện ra.
      </p>
    </div>

    <!-- QR + link + in tờ dán xưởng -->
    <div class="card p-5 text-center shadow-soft">
      <h2 class="text-sm font-semibold text-foreground">Mã QR cài app</h2>
      <p class="mt-1 text-xs text-muted-foreground">Quét bằng camera điện thoại — dùng để in dán tại xưởng.</p>

      <div class="mt-4 flex justify-center">
        <div v-if="qrDataUrl" class="rounded-xl bg-white p-3 ring-1 ring-border">
          <img :src="qrDataUrl" alt="QR cài app BGDecor Fulfillment" class="h-48 w-48" />
        </div>
        <UiSpinner v-else :size="24" />
      </div>

      <p class="mt-3 break-all font-mono text-xs text-muted-foreground">{{ appUrl }}</p>

      <div class="mt-4 flex flex-wrap justify-center gap-2">
        <button class="btn-secondary" @click="copyLink">Sao chép link</button>
        <button v-if="canShare" class="btn-secondary" @click="share">Chia sẻ</button>
        <button class="btn-secondary" :disabled="!qrDataUrl" @click="printPoster">In tờ QR (A5)</button>
      </div>
    </div>

    <p class="pb-4 text-center text-xs text-muted-foreground">
      Sau khi cài, mở app và đăng nhập bằng tài khoản được cấp.
      <NuxtLink to="/login" class="text-primary underline-offset-2 hover:underline">Đăng nhập ngay</NuxtLink>
    </p>
  </div>
</template>
