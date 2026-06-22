<script setup>
import { ref } from 'vue';

// Public assets — referenced as runtime strings so Vite leaves them in /public.
const beforeSrc = '/assets/before.png';
const afterSrc = '/assets/after.png';

const pos = ref(50); // percentage revealed of the "after" image
const dragging = ref(false);
const container = ref(null);
const available = ref(true); // hide the showcase if the images aren't present

function setFromClientX(clientX) {
  const el = container.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
  pos.value = (x / rect.width) * 100;
}

function onPointerDown(e) {
  dragging.value = true;
  setFromClientX(e.clientX);
}
function onPointerMove(e) {
  if (!dragging.value) return;
  setFromClientX(e.clientX);
}
function onPointerUp() {
  dragging.value = false;
}
</script>

<template>
  <figure v-show="available" class="max-w-xl mx-auto my-8 select-none">
    <div
      ref="container"
      class="group relative w-full aspect-square rounded-2xl overflow-hidden shadow-xl border border-gray-200 dark:border-gray-800 cursor-ew-resize touch-none"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    >
      <!-- After (clean) image is the base layer -->
      <img
        :src="afterSrc"
        alt="Gemini AI image after the sparkle watermark was removed"
        class="absolute inset-0 w-full h-full object-cover"
        draggable="false"
        loading="lazy"
        @error="available = false"
      />
      <!-- Before (watermarked) image clipped to the left of the handle -->
      <img
        :src="beforeSrc"
        alt="Gemini AI image with the visible sparkle watermark"
        class="absolute inset-0 w-full h-full object-cover"
        draggable="false"
        loading="lazy"
        :style="{ clipPath: `inset(0 ${100 - pos}% 0 0)` }"
        @error="available = false"
      />

      <!-- Labels -->
      <span
        class="absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full bg-black/60 text-white backdrop-blur-sm"
        >Before</span
      >
      <span
        class="absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-600/80 text-white backdrop-blur-sm"
        >After</span
      >

      <!-- Divider + handle -->
      <div
        class="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.4)] pointer-events-none"
        :style="{ left: `${pos}%` }"
      >
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center text-brand-primary"
        >
          <iconify-icon icon="ph:arrows-left-right-bold" width="18"></iconify-icon>
        </div>
      </div>
    </div>
    <figcaption class="mt-3 text-xs text-slate-400 dark:text-slate-500 font-medium">
      Drag the slider — watermark removed losslessly, pixel-perfect.
    </figcaption>
  </figure>
</template>
