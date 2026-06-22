<script setup>
import { ref, watch, onMounted, nextTick } from 'vue';
import { cleanFrame } from '../engine/tuner.js';

const props = defineProps({
  settings: { type: Object, required: true }, // reactive { gain, offsetX, offsetY, sizeScale }
  frame: { type: Object, required: true },    // { width, height, imageData }
  bgImg: { type: Object, required: true },    // HTMLImageElement (sparkle)
  base: { type: Object, required: true },     // { size, x, y, width, height }
});

const mainCanvas = ref(null);
const zoomCanvas = ref(null);
let offscreen = null;

function render() {
  const { width, height, imageData } = props.frame || {};
  if (!width || !mainCanvas.value) return;
  if (!offscreen) {
    offscreen = document.createElement('canvas');
  }
  offscreen.width = width;
  offscreen.height = height;

  const copy = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
  const { wm, roi } = cleanFrame(props.bgImg, copy, width, height, props.base, { ...props.settings });
  offscreen.getContext('2d').putImageData(copy, 0, 0);

  // Main canvas — fit, with the watermark-box guide.
  const main = mainCanvas.value;
  const maxW = 360;
  const scale = Math.min(1, maxW / width);
  main.width = Math.round(width * scale);
  main.height = Math.round(height * scale);
  const mctx = main.getContext('2d');
  mctx.drawImage(offscreen, 0, 0, main.width, main.height);
  mctx.strokeStyle = '#6366f1';
  mctx.lineWidth = 2;
  mctx.strokeRect(wm.x * scale, wm.y * scale, wm.width * scale, wm.height * scale);

  // Zoom canvas — magnified corner.
  const zoom = zoomCanvas.value;
  if (zoom) {
    const zctx = zoom.getContext('2d');
    zctx.imageSmoothingEnabled = false;
    zctx.clearRect(0, 0, zoom.width, zoom.height);
    zctx.drawImage(offscreen, roi.x, roi.y, roi.width, roi.height, 0, 0, zoom.width, zoom.height);
    const sx = zoom.width / roi.width;
    const sy = zoom.height / roi.height;
    zctx.strokeStyle = '#22c55e';
    zctx.lineWidth = 2;
    zctx.strokeRect((wm.x - roi.x) * sx, (wm.y - roi.y) * sy, wm.width * sx, wm.height * sy);
  }
}

watch(() => ({ ...props.settings }), () => render());
watch(() => props.frame, async () => { await nextTick(); render(); });
onMounted(async () => { await nextTick(); render(); });
defineExpose({ render });
</script>

<template>
  <div>
    <div class="flex flex-col sm:flex-row gap-4 items-start">
      <div class="flex flex-col items-center">
        <span class="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Preview</span>
        <canvas ref="mainCanvas" class="rounded-xl border border-gray-200 dark:border-gray-700 max-w-full bg-black/5"></canvas>
      </div>
      <div class="flex flex-col items-center">
        <span class="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Corner (zoomed)</span>
        <canvas ref="zoomCanvas" width="200" height="200" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-black/5" style="image-rendering: pixelated"></canvas>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 mt-4">
      <label class="block">
        <div class="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
          <span>Strength</span><span>{{ settings.gain.toFixed(2) }}×</span>
        </div>
        <input type="range" min="0.1" max="3" step="0.05" v-model.number="settings.gain" class="w-full accent-brand-primary" />
      </label>
      <label class="block">
        <div class="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
          <span>Size</span><span>{{ settings.sizeScale.toFixed(2) }}×</span>
        </div>
        <input type="range" min="0.5" max="2" step="0.05" v-model.number="settings.sizeScale" class="w-full accent-brand-primary" />
      </label>
      <label class="block">
        <div class="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
          <span>Position X</span><span>{{ settings.offsetX }}px</span>
        </div>
        <input type="range" min="-150" max="150" step="1" v-model.number="settings.offsetX" class="w-full accent-brand-primary" />
      </label>
      <label class="block">
        <div class="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
          <span>Position Y</span><span>{{ settings.offsetY }}px</span>
        </div>
        <input type="range" min="-150" max="150" step="1" v-model.number="settings.offsetY" class="w-full accent-brand-primary" />
      </label>
    </div>
  </div>
</template>
