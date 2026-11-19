<script setup lang="ts">
import { chatAssetUrl } from '~/services/api/chat'
import { useChatStore } from '~/stores/chat'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'
import { errorMessage } from '~/utils/api-error'
import type { ChatAttachment, ChatConversation, ChatMember, ChatMessage } from '~/types/chat'
import { clockTime, fileSize, fullTime, isEmojiOnly, messageSegments } from '~/utils/chat'

// Một tin trong luồng, kiểu Messenger: tin mình bên phải màu chàm, người khác bên
// trái xám nhạt; các tin liền nhau của cùng người (Thread tính first/last) nối
// góc, avatar chỉ ở tin cuối cụm, tên người gửi (nhóm) ở tin đầu cụm. Có trích
// dẫn, chữ (mã đơn/batch + link web thành link), ảnh, file, cảm xúc, "đã sửa",
// tin thu hồi, dòng hệ thống. Rê chuột (hoặc chạm) vào tin: hiện giờ gửi + thanh
// thao tác (thả cảm xúc, trả lời, sửa trong 15 phút, thu hồi).
const props = withDefaults(
  defineProps<{
    m: ChatMessage
    conv: ChatConversation
    first: boolean
    last: boolean
    /** Thành viên (trừ mình) đã xem tới đúng tin này. */
    readers: ChatMember[]
    /** Tin cuối của luồng: hiện chữ "Đã xem / Đã gửi". */
    isTail: boolean
    highlight: boolean
    /** Khung hẹp (ô chat nhỏ): thanh thao tác nổi phía trên tin thay vì nằm cạnh. */
    compact?: boolean
  }>(),
  { compact: false },
)
const emit = defineEmits<{
  (e: 'reply', m: ChatMessage): void
  (e: 'edit', m: ChatMessage): void
  (e: 'media', list: ChatAttachment[], index: number): void
  (e: 'jump', id: number): void
}>()

const chat = useChatStore()
const toast = useToastStore()
const { confirm } = useConfirm()

const mine = computed(() => props.m.sender_id === chat.me)
const isGroup = computed(() => props.conv.kind === 'group')
const recalled = computed(() => !!props.m.recalled_at)
const segments = computed(() => messageSegments(props.m.body || '', props.m.refs))
const emojiOnly = computed(() => isEmojiOnly(props.m.body || ''))
const images = computed(() => (props.m.attachments || []).filter((a) => a.is_image))
const files = computed(() => (props.m.attachments || []).filter((a) => !a.is_image))
const localImages = computed(() => (props.m.id < 0 ? (props.m.localPreviews || []).filter((p) => p.url) : []))
const localFiles = computed(() => (props.m.id < 0 ? (props.m.localPreviews || []).filter((p) => !p.url) : []))
const imageCount = computed(() => images.value.length + localImages.value.length)
const canEdit = computed(
  () =>
    mine.value &&
    props.m.id > 0 &&
    !recalled.value &&
    props.m.kind !== 'system' &&
    Date.now() - Date.parse(props.m.created_at) < chat.editMinutes * 60_000,
)
const actionsOpen = ref(false)
const picking = ref(false)
const root = ref<HTMLElement | null>(null)

/** Bo góc kiểu Messenger: 18px, góc phía người gửi thu về 4px ở chỗ nối hai tin liền nhau. */
const corner = computed(() => {
  const f = props.first
  const l = props.last
  if (f && l) return 'rounded-[18px]'
  if (mine.value) return f ? 'rounded-[18px] rounded-br-[4px]' : l ? 'rounded-[18px] rounded-tr-[4px]' : 'rounded-[18px] rounded-r-[4px]'
  return f ? 'rounded-[18px] rounded-bl-[4px]' : l ? 'rounded-[18px] rounded-tl-[4px]' : 'rounded-[18px] rounded-l-[4px]'
})
const tone = computed(() => (mine.value ? 'bg-chat-mine text-chat-mine-foreground' : 'bg-chat-other text-chat-other-foreground'))

/**
 * Thanh giờ + thao tác. Trang đầy đủ (màn rộng): nằm cạnh tin như Messenger.
 * Ô chat nhỏ và điện thoại: nổi phía trên tin để không chiếm bề ngang bong bóng.
 */
const toolbarClass = computed(() => {
  if (props.compact) {
    return `absolute bottom-full z-20 mb-1 rounded-full border border-border bg-card px-1 py-0.5 shadow-soft ${mine.value ? 'right-0' : 'left-9'}`
  }
  return `relative self-center max-sm:absolute max-sm:bottom-full max-sm:z-20 max-sm:mb-1 max-sm:self-auto max-sm:rounded-full max-sm:border max-sm:border-border max-sm:bg-card max-sm:px-1 max-sm:py-0.5 max-sm:shadow-soft ${mine.value ? 'max-sm:right-0' : 'max-sm:left-9'}`
})

/** Ảnh đơn: biết kích thước thì giữ chỗ đúng tỉ lệ ngay từ đầu (ảnh tải xong không làm nhảy luồng tin). */
const IMG_MAX_W = 240
const IMG_MAX_H = 280
function imgBox(a: ChatAttachment) {
  if (!a.width || !a.height) return undefined
  const s = Math.min(1, IMG_MAX_W / a.width, IMG_MAX_H / a.height)
  return { width: `${Math.max(96, Math.round(a.width * s))}px`, aspectRatio: `${a.width} / ${a.height}` }
}

function givenName(name: string | undefined): string {
  return (name || '').trim().split(/\s+/).slice(-1)[0] || 'Ai đó'
}
function nameOf(id: number): string {
  return props.conv.members.find((x) => x.id === id)?.full_name || 'Ai đó'
}
function reactionTitle(ids: number[]): string {
  return ids.map((id) => (id === chat.me ? 'Bạn' : nameOf(id))).join(', ')
}
const myReaction = computed(() => (props.m.reactions || []).find((r) => r.user_ids.includes(chat.me))?.emoji)
/** "Bạn đã trả lời Kiên", "Hoa đã trả lời bạn", "Kiên đã trả lời chính mình". */
const replyLabel = computed(() => {
  const r = props.m.reply_to
  if (!r) return ''
  const who = mine.value ? 'Bạn' : givenName(props.m.sender_name)
  const target =
    r.sender_id === props.m.sender_id ? 'chính mình' : r.sender_id === chat.me ? 'bạn' : givenName(r.sender_name)
  return `${who} đã trả lời ${target}`
})

async function react(emoji: string) {
  picking.value = false
  actionsOpen.value = false
  try {
    await chat.react(props.m, emoji)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
async function recall() {
  actionsOpen.value = false
  const ok = await confirm({
    title: 'Thu hồi tin nhắn?',
    message: 'Tin (cả ảnh, file và cảm xúc) sẽ bị xoá với mọi người trong cuộc. Không hoàn tác được.',
    confirmText: 'Thu hồi',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await chat.recall(props.m)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
function onBubbleClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('a,button')) return
  actionsOpen.value = !actionsOpen.value
}
function openFile(a: ChatAttachment) {
  if (a.mime === 'application/pdf') emit('media', [a], 0)
}

// Chạm ra ngoài tin thì thu thanh thao tác / bảng cảm xúc lại (điện thoại không có "rê chuột ra").
function onDocPointer(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) {
    actionsOpen.value = false
    picking.value = false
  }
}
watch(
  () => actionsOpen.value || picking.value,
  (on) => {
    if (on) document.addEventListener('pointerdown', onDocPointer, true)
    else document.removeEventListener('pointerdown', onDocPointer, true)
  },
)
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer, true))

const seenText = computed(() => {
  if (!props.isTail || !mine.value || props.m.id < 0) return ''
  if (!props.readers.length) return 'Đã gửi'
  if (!isGroup.value) return 'Đã xem'
  // Ít người thì ghi đủ tên; đông thì tên gọi (chữ cuối) cho gọn.
  const names = props.readers.map((r) => (props.readers.length <= 3 ? r.full_name : givenName(r.full_name)))
  return `Đã xem: ${names.join(', ')}`
})
</script>

<template>
  <!-- Dòng hệ thống: "A đã tạo nhóm", "A đã thêm B"… -->
  <div v-if="m.kind === 'system'" class="my-3 px-6 text-center text-[13px] text-muted-foreground" :data-chat-msg="m.id" data-chat-system>
    {{ m.body }}
  </div>

  <div
    v-else
    ref="root"
    class="group/msg flex flex-col"
    :class="[mine ? 'items-end' : 'items-start', first ? 'mt-3' : 'mt-0.5']"
    :data-chat-msg="m.id"
  >
    <p v-if="isGroup && first && !mine" class="mb-1 ml-12 max-w-[70%] truncate text-xs font-medium text-muted-foreground" data-chat-sender>
      {{ m.sender_name }}
    </p>

    <div class="relative flex w-full items-end gap-2" :class="mine ? 'flex-row-reverse' : 'flex-row'">
      <!-- Avatar người gửi: chỉ ở tin cuối cụm, các tin trên chừa chỗ cho thẳng hàng -->
      <div v-if="!mine" class="mb-0.5 w-7 shrink-0">
        <ChatAvatar v-if="last" :id="m.sender_id" :name="m.sender_name || nameOf(m.sender_id)" :size="28" />
      </div>

      <div
        class="relative flex min-w-0 max-w-[78%] flex-col sm:max-w-[70%]"
        :class="[
          mine ? 'items-end' : 'items-start',
          highlight ? 'rounded-[20px] ring-2 ring-amber-400 ring-offset-2 ring-offset-card' : '',
          m.pending === 'sending' ? 'opacity-70' : '',
        ]"
        data-chat-bubble-body
        @click="onBubbleClick"
      >
        <!-- Trích dẫn: nhãn "X đã trả lời Y" + tin gốc mờ, gối dưới bong bóng -->
        <template v-if="m.reply_to">
          <p class="flex max-w-full items-center gap-1 px-1 pb-1 text-xs text-muted-foreground">
            <UiIcon name="reply" :size="12" class="shrink-0" />
            <span class="truncate">{{ replyLabel }}</span>
          </p>
          <button
            type="button"
            class="chat-focus -mb-3 line-clamp-2 max-w-full rounded-[18px] bg-muted px-3 pb-4 pt-2 text-left text-sm leading-snug text-foreground/75 transition-colors hover:bg-accent"
            :title="m.reply_to.recalled ? '' : m.reply_to.body"
            data-chat-quote
            @click.stop="emit('jump', m.reply_to.id)"
          >
            <span class="sr-only">{{ m.reply_to.sender_name }}: </span><i v-if="m.reply_to.recalled">Tin nhắn đã được thu hồi</i
            ><span v-else-if="m.reply_to.body">{{ m.reply_to.body }}</span
            ><span v-else-if="m.reply_to.attachment">{{ m.reply_to.is_image ? '📷 Ảnh' : `📎 ${m.reply_to.attachment}` }}</span>
          </button>
        </template>

        <!-- Thu hồi -->
        <div
          v-if="recalled"
          class="relative border border-border bg-card px-3 py-2 text-base italic leading-[1.4] text-muted-foreground sm:text-[15px]"
          :class="corner"
          data-chat-recalled
        >
          {{ mine ? 'Bạn đã thu hồi một tin nhắn' : 'Tin nhắn đã được thu hồi' }}
        </div>

        <template v-else>
          <!-- Ảnh: 1 ảnh giữ đúng tỉ lệ, nhiều ảnh thành ô vuông 2 cột -->
          <div
            v-if="imageCount"
            class="relative mb-0.5 grid gap-0.5 overflow-hidden"
            :class="[corner, imageCount > 1 ? 'grid-cols-2' : 'grid-cols-1']"
          >
            <button
              v-for="(a, i) in images"
              :key="a.id"
              type="button"
              class="chat-focus block overflow-hidden bg-muted"
              :title="a.name"
              data-chat-image
              @click.stop="emit('media', images, i)"
            >
              <img
                :src="chatAssetUrl(a.thumb_url || a.url)"
                :alt="a.name"
                class="block object-cover"
                :class="imageCount > 1 ? 'h-32 w-32' : imgBox(a) ? 'h-auto max-w-full' : 'max-h-64 max-w-[240px]'"
                :style="imageCount > 1 ? undefined : imgBox(a)"
                loading="lazy"
              />
            </button>
            <div v-for="p in localImages" :key="p.name" class="relative overflow-hidden bg-muted">
              <img :src="p.url!" :alt="p.name" class="block object-cover opacity-70" :class="imageCount > 1 ? 'h-32 w-32' : 'max-h-64 max-w-[240px]'" />
              <span v-if="m.pending === 'sending'" class="absolute inset-0 flex items-center justify-center"><UiSpinner :size="22" /></span>
            </div>
          </div>
          <!-- File -->
          <div v-if="files.length || localFiles.length" class="relative mb-0.5 flex max-w-full flex-col gap-0.5">
            <div
              v-for="a in files"
              :key="a.id"
              class="flex w-72 max-w-full items-center gap-2.5 border border-border bg-card py-2 pl-2.5 pr-1.5"
              :class="corner"
              data-chat-file
            >
              <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                <UiIcon name="file" :size="18" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="line-clamp-2 text-sm font-medium leading-snug text-foreground [overflow-wrap:anywhere]" :title="a.name">{{ a.name }}</span>
                <span class="block text-xs text-muted-foreground">{{ fileSize(a.size) }}</span>
              </span>
              <button
                v-if="a.mime === 'application/pdf'"
                type="button"
                class="chat-focus rounded-lg px-2 py-1.5 text-sm font-semibold text-primary hover:bg-muted"
                data-chat-file-view
                @click.stop="openFile(a)"
              >
                Xem
              </button>
              <a
                :href="chatAssetUrl(a.download_url)"
                class="chat-focus rounded-lg px-2 py-1.5 text-sm font-semibold text-primary hover:bg-muted"
                :download="a.name"
                rel="noopener"
                @click.stop
              >
                Tải
              </a>
            </div>
            <div
              v-for="p in localFiles"
              :key="p.name"
              class="flex w-72 max-w-full items-center gap-2 border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
              :class="corner"
            >
              <UiIcon name="file" :size="18" />
              <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
              <span class="text-xs">{{ fileSize(p.size) }}</span>
            </div>
          </div>
          <!-- Chữ: chỉ 1–3 emoji thì hiện to không nền, như Messenger -->
          <div v-if="m.body && emojiOnly" class="relative px-0.5 text-[2.5rem] leading-tight" data-chat-body>{{ m.body.trim() }}</div>
          <div
            v-else-if="m.body"
            class="relative whitespace-pre-wrap break-words px-3 py-2 text-base leading-[1.4] sm:text-[15px]"
            :class="[corner, tone]"
            data-chat-body
          ><template v-for="(s, i) in segments" :key="i"><NuxtLink
            v-if="s.t === 'ref'"
            :to="s.to"
            class="rounded-sm font-semibold underline decoration-2 underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
            :title="s.kind === 'batch' ? 'Mở batch' : 'Mở đơn'"
            data-chat-ref
            @click.stop
          >{{ s.v }}</NuxtLink><a
            v-else-if="s.t === 'url'"
            :href="s.href"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-sm underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
            @click.stop
          >{{ s.v }}</a><template v-else>{{ s.v }}</template></template></div>
        </template>

        <!-- Cảm xúc: gối lên mép dưới bong bóng -->
        <div v-if="m.reactions?.length" class="relative z-[1] -mt-1.5 flex flex-wrap gap-1 px-2" :class="mine ? 'justify-end' : 'justify-start'">
          <button
            v-for="r in m.reactions"
            :key="r.emoji"
            type="button"
            class="chat-focus inline-flex h-6 items-center gap-0.5 rounded-full px-1.5 text-[13px] leading-none shadow-softer ring-1"
            :class="r.user_ids.includes(chat.me) ? 'bg-accent ring-primary/60' : 'bg-card ring-border'"
            :title="reactionTitle(r.user_ids)"
            :aria-label="`${r.emoji} ${reactionTitle(r.user_ids)}`"
            :data-chat-reaction="r.emoji"
            @click.stop="react(r.emoji)"
          >
            <span>{{ r.emoji }}</span><span v-if="r.user_ids.length > 1" class="text-xs font-medium text-muted-foreground">{{ r.user_ids.length }}</span>
          </button>
        </div>
      </div>

      <!-- Giờ gửi + thanh thao tác: hiện khi rê chuột / chạm vào tin / dùng phím Tab -->
      <div
        v-if="m.id > 0"
        class="flex shrink-0 items-center gap-0.5 transition-opacity"
        :class="[
          toolbarClass,
          actionsOpen || picking
            ? 'opacity-100'
            : 'pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100',
        ]"
        data-chat-actions
      >
        <span class="whitespace-nowrap px-1.5 text-xs text-muted-foreground" :title="fullTime(m.created_at)" data-chat-time>{{ clockTime(m.created_at) }}</span>
        <template v-if="!recalled">
          <button type="button" class="chat-act" title="Thả cảm xúc" aria-label="Thả cảm xúc" data-chat-act-react @click.stop="picking = !picking">
            <UiIcon name="smile" :size="17" />
          </button>
          <button type="button" class="chat-act" title="Trả lời" aria-label="Trả lời" data-chat-act-reply @click.stop="emit('reply', m); actionsOpen = false">
            <UiIcon name="reply" :size="17" />
          </button>
          <button v-if="canEdit" type="button" class="chat-act" title="Sửa (trong 15 phút)" aria-label="Sửa" data-chat-act-edit @click.stop="emit('edit', m); actionsOpen = false">
            <UiIcon name="pencil" :size="16" />
          </button>
          <button v-if="mine" type="button" class="chat-act" title="Thu hồi" aria-label="Thu hồi" data-chat-act-recall @click.stop="recall">
            <UiIcon name="trash" :size="16" />
          </button>
        </template>
        <div
          v-if="picking"
          class="absolute bottom-full z-30 mb-1 flex gap-0.5 rounded-full border border-border bg-card px-1.5 py-1 shadow-soft"
          :class="mine ? 'right-0' : 'left-0'"
          data-chat-react-picker
        >
          <button
            v-for="e in chat.reactionSet"
            :key="e"
            type="button"
            class="chat-focus rounded-full p-1 text-2xl leading-none transition-transform hover:scale-125"
            :class="myReaction === e ? 'bg-accent' : ''"
            :aria-label="`Thả ${e}`"
            :data-chat-emoji="e"
            @click.stop="react(e)"
          >
            {{ e }}
          </button>
        </div>
      </div>
    </div>

    <!-- Trạng thái gửi / đã sửa -->
    <div
      v-if="m.pending || (m.edited_at && !recalled)"
      class="mt-0.5 text-xs text-muted-foreground"
      :class="mine ? 'pr-1 text-right' : 'pl-11'"
    >
      <span v-if="m.pending === 'sending'">Đang gửi…</span>
      <span v-else-if="m.pending === 'failed'" class="text-destructive">
        {{ m.error || 'Gửi lỗi' }} · <button class="chat-focus rounded underline" @click="chat.retry(m)">Thử lại</button> ·
        <button class="chat-focus rounded underline" @click="chat.discard(m)">Bỏ</button>
      </span>
      <span v-else data-chat-edited>Đã sửa</span>
    </div>

    <!-- Đã xem: avatar người đã xem tới tin này, luôn bên phải như Messenger -->
    <div v-if="readers.length || seenText" class="mt-1 flex w-full items-center justify-end gap-1 pr-0.5" data-chat-seen>
      <span v-if="seenText" class="text-xs text-muted-foreground" data-chat-seen-text>{{ seenText }}</span>
      <span class="flex -space-x-1">
        <ChatAvatar v-for="r in readers.slice(0, 6)" :key="r.id" :id="r.id" :name="r.full_name" :size="16" />
      </span>
      <span v-if="readers.length > 6" class="text-[11px] text-muted-foreground">+{{ readers.length - 6 }}</span>
    </div>
  </div>
</template>

<style scoped>
.chat-act {
  @apply inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring;
}
</style>
