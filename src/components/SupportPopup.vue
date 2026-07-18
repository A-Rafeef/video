<script setup>
import { ref, onMounted } from 'vue';

const STORAGE_KEY = 'supportPopupDismissed';
const visible = ref(false);
const leaving = ref(false);

onMounted(() => {
  if (!sessionStorage.getItem(STORAGE_KEY)) {
    setTimeout(() => { visible.value = true; }, 7000);
  }
});

function dismiss() {
  sessionStorage.setItem(STORAGE_KEY, '1');
  leaving.value = true;
  setTimeout(() => { visible.value = false; }, 400);
}
</script>

<template>
  <div
    v-if="visible"
    role="dialog"
    aria-modal="true"
    aria-label="Support the creator"
    class="fixed bottom-6 right-6 z-50 w-72 rounded-2xl shadow-2xl overflow-hidden support-popup"
    :class="{ 'hidden-popup': leaving }"
    style="background: linear-gradient(135deg, #211d51 0%, #7318b8 100%)"
  >
    <button
      @click="dismiss"
      aria-label="Dismiss support popup"
      class="absolute top-3 right-3 text-white/50 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
    >
      <iconify-icon icon="ph:x-bold" width="16" aria-hidden="true"></iconify-icon>
    </button>

    <div class="p-5">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-3xl" aria-hidden="true">☕</span>
        <div>
          <p class="text-white font-bold text-sm leading-tight">Enjoying the tool?</p>
          <p class="text-white/60 text-xs">Help keep it free &amp; open source</p>
        </div>
      </div>

      <p class="text-white/70 text-xs mb-4 leading-relaxed">
        This tool is 100% free. If it saved you time, consider buying me a coffee via
        <b>Patreon</b> or a quick <b>UPI</b> donation — it helps cover maintenance
        costs and future features!
      </p>

      <a
        href="https://www.patreon.com/cw/AbhinKrishna/membership"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-bold text-sm text-white transition-transform hover:scale-105 active:scale-95"
        style="background: #ff424d"
      >
        <iconify-icon icon="simple-icons:patreon" width="16" aria-hidden="true"></iconify-icon>
        Support on Patreon
      </a>

      <a
        href="/donate/"
        class="mt-2 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-bold text-sm text-white transition-transform hover:scale-105 active:scale-95"
        style="background: #097939"
      >
        <iconify-icon icon="ph:hand-heart-fill" width="16" aria-hidden="true"></iconify-icon>
        Donate via UPI (India)
      </a>

      <button
        @click="dismiss"
        class="mt-2 w-full text-center text-white/40 hover:text-white/70 text-xs transition-colors"
        aria-label="No thanks, dismiss popup"
      >
        No thanks
      </button>
    </div>
  </div>
</template>
