<script setup>
import { ref } from 'vue';
const visible = ref(true);
</script>

<template>
  <div
    v-if="visible"
    class="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800"
    role="alert"
  >
    <div class="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
        <iconify-icon icon="ph:megaphone-bold" width="18" class="flex-shrink-0" aria-hidden="true"></iconify-icon>
        <p class="m-0">
          <strong>Heads up:</strong> Google occasionally changes the watermark position —
          newly generated images/videos may not always clean perfectly. We keep the engine updated.
        </p>
      </div>
      <button
        @click="visible = false"
        class="flex-shrink-0 p-1 rounded hover:bg-amber-200/50 dark:hover:bg-amber-800/30 text-amber-600 dark:text-amber-400 transition-colors"
        aria-label="Dismiss notification"
      >
        <iconify-icon icon="ph:x-bold" width="14"></iconify-icon>
      </button>
    </div>
  </div>
</template>
