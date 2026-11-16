<script setup lang="ts">
// Chat cho seller: chỉ nhắn được với tài khoản nội bộ (API chặn seller khác).
definePageMeta({ layout: 'seller', fullBleed: true })
useHead({ title: 'Tin nhắn · Seller Portal' })
</script>

<template>
  <ChatApp />
</template>
