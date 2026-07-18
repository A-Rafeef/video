<script setup>
import { ref } from 'vue';
const visible = ref(true);
</script>

<template>
  <div
    v-if="visible"
    class="bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800"
    role="status"
  >
    <div class="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-sm font-medium text-indigo-800 dark:text-indigo-300">
        <iconify-icon icon="ph:sparkle-fill" width="18" class="flex-shrink-0" aria-hidden="true"></iconify-icon>
        <p class="m-0">
          <strong>New:</strong> We now support both the new and old Gemini watermark positions —
          pick your file's generation from the "Watermark position" dropdown.
        </p>
      </div>
      <button
        @click="visible = false"
        class="flex-shrink-0 p-1 rounded hover:bg-indigo-200/50 dark:hover:bg-indigo-800/30 text-indigo-600 dark:text-indigo-400 transition-colors"
        aria-label="Dismiss notification"
      >
        <iconify-icon icon="ph:x-bold" width="14"></iconify-icon>
      </button>
    </div>
  </div>
</template>
