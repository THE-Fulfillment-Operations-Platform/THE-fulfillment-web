<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { SELLER_NAV } from '~/utils/navigation'
import { useApiDocsUrl } from '~/composables/useApiDocsUrl'
import { useChatStore } from '~/stores/chat'
const apiDocsUrl = useApiDocsUrl()
const auth = useAuthStore()
const route = useRoute()
const chat = useChatStore()
// "Tin nhắn" chỉ hiện khi API mở chat cho seller (CHAT_ALLOW_SELLER).
const nav = computed(() => SELLER_NAV.filter((i) => !i.chat || chat.enabled))

function isActive(to: string) {
  if (to === '/seller') {
    return (
      route.path === '/seller' ||
      (route.path.startsWith('/seller/') && !route.path.startsWith('/seller/import') && !route.path.startsWith('/seller/chat'))
    )
  }
  return route.path === to || route.path.startsWith(to + '/')
}
</script>

<template>
  <div class="flex flex-col bg-background" :class="route.meta.fullBleed ? 'h-screen overflow-hidden supports-[height:100dvh]:h-[100dvh]' : 'min-h-screen'">
    <header class="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-4 lg:px-6">
      <div class="flex min-w-0 items-center gap-2.5 sm:gap-4">
        <div class="flex min-w-0 items-center gap-2.5">
          <AppLogo variant="the" />
          <span class="hidden truncate text-sm font-semibold text-foreground sm:inline">Seller Portal</span>
        </div>
        <nav class="flex items-center gap-1">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors"
            :class="isActive(item.to) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
          >
            <UiIcon :name="item.icon" :size="16" />
            <span class="hidden sm:inline">{{ item.label }}</span>
            <span
              v-if="item.chat && chat.totalUnread > 0"
              class="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-rose-500 px-1 py-0.5 text-[10px] font-semibold leading-none text-white"
              :title="`${chat.totalUnread} tin chưa đọc`"
            >{{ chat.totalUnread > 99 ? '99+' : chat.totalUnread }}</span>
          </NuxtLink>
          <!-- Seller có hệ thống riêng thì đội kỹ thuật của họ cần trang này. -->
          <a
            :href="apiDocsUrl"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Tài liệu kết nối API"
          >
            <UiIcon name="link" :size="16" />
            <span class="hidden sm:inline">Kết nối API</span>
          </a>
        </nav>
      </div>
      <div class="flex shrink-0 items-center gap-2 sm:gap-3">
        <span class="hidden max-w-[10rem] truncate text-sm text-foreground sm:inline">{{ auth.fullName }}</span>
        <ThemeToggle />
        <button class="btn-secondary h-10 px-2.5 sm:h-auto sm:py-1.5" title="Đăng xuất" @click="auth.logout()">
          <UiIcon name="logout" :size="16" />
          <span class="hidden sm:inline">Đăng xuất</span>
        </button>
      </div>
    </header>
    <!-- Trang chat (definePageMeta fullBleed: true) chiếm trọn phần còn lại của
         màn hình, tự cuộn bên trong — không padding, không giới hạn bề ngang. -->
    <main v-if="route.meta.fullBleed" class="min-h-0 flex-1 overflow-hidden">
      <slot />
    </main>
    <main v-else class="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6" :class="chat.enabled ? 'pb-24 sm:pb-24 lg:pb-24' : ''">
      <!-- Trang có bảng nhiều cột (definePageMeta wide: true) được nới khung;
           các trang còn lại giữ 5xl cho dễ đọc. -->
      <div class="mx-auto w-full" :class="route.meta.wide ? 'max-w-screen-2xl' : 'max-w-5xl'">
        <slot />
      </div>
    </main>
  </div>
</template>
