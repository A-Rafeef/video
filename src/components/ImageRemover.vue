<script setup>
import { ref, computed } from 'vue';

// Engine is lazy-loaded only when the user uploads an image.
let enginePromise = null;
function getEngine() {
  if (!enginePromise) {
    enginePromise = import('../engine/watermarkEngine.js').then(({ WatermarkEngine }) =>
      WatermarkEngine.create()
    );
  }
  return enginePromise;
}

const fileInput = ref(null);
const dragOver = ref(false);
const items = ref([]); // { name, displayName, status, originalSrc, url, blob, width, height }

const doneItems = computed(() => items.value.filter((i) => i.status === 'done'));
const hasResults = computed(() => items.value.length > 0);

function openPicker() {
  fileInput.value?.click();
}

function onDrop(e) {
  dragOver.value = false;
  handleFiles(e.dataTransfer.files);
}

function onChange(e) {
  handleFiles(e.target.files);
}

async function handleFiles(fileList) {
  const valid = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
  if (!valid.length) return;

  reset(); // clear any previous run

  let engine;
  try {
    engine = await getEngine();
  } catch {
    alert('Error: watermark assets could not be loaded.');
    return;
  }

  for (const file of valid) {
    // Push a plain object, then mutate through the reactive proxy so the UI updates.
    const idx =
      items.value.push({
        name: `clean_${file.name.replace(/\.[^/.]+$/, '')}.png`,
        displayName: file.name,
        status: 'loading',
        originalSrc: '',
        url: '',
        blob: null,
        width: 0,
        height: 0,
      }) - 1;
    const item = items.value[idx];

    try {
      const result = await engine.process(file);
      item.status = 'done';
      item.originalSrc = result.originalSrc;
      item.url = URL.createObjectURL(result.blob);
      item.blob = result.blob;
      item.width = result.width;
      item.height = result.height;
    } catch (err) {
      console.error(err);
      item.status = 'error';
    }
  }
}

function downloadOne(item) {
  const a = document.createElement('a');
  a.href = item.url;
  a.download = item.name;
  a.click();
}

async function downloadAll() {
  const done = doneItems.value;
  if (!done.length) return;
  const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
  const zip = new JSZip();
  done.forEach((item) => zip.file(item.name, item.blob));
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cleaned_images_${Date.now()}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reset() {
  items.value.forEach((i) => {
    if (i.url) URL.revokeObjectURL(i.url);
    if (i.originalSrc) URL.revokeObjectURL(i.originalSrc);
  });
  items.value = [];
  if (fileInput.value) fileInput.value.value = '';
}
</script>

<template>
  <div
    class="max-w-5xl mx-auto bg-white dark:bg-theme-cardDark rounded-3xl shadow-xl dark:shadow-none p-4 border border-gray-100 dark:border-gray-800 relative z-10 transition-colors"
  >
    <!-- Upload area -->
    <div
      v-if="!hasResults"
      class="group relative flex flex-col items-center justify-center w-full h-56 border-2 border-dashed rounded-2xl bg-gray-50/50 dark:bg-gray-800/50 transition-all cursor-pointer"
      :class="
        dragOver
          ? 'border-brand-primary bg-indigo-50/60 dark:bg-gray-800'
          : 'border-gray-300 dark:border-gray-700 hover:bg-indigo-50/50 dark:hover:bg-gray-800 hover:border-brand-primary'
      "
      role="button"
      tabindex="0"
      aria-label="Upload area — click to select images or drag and drop"
      @click="openPicker"
      @keydown.enter="openPicker"
      @dragover.prevent="dragOver = true"
      @dragenter.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <div class="flex flex-col items-center justify-center">
        <div
          class="w-14 h-14 bg-white dark:bg-gray-700 rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"
        >
          <iconify-icon
            icon="ph:upload-simple-bold"
            class="text-2xl text-gray-400 dark:text-gray-300 group-hover:text-brand-primary"
            aria-hidden="true"
          ></iconify-icon>
        </div>
        <p
          class="mb-1 text-base font-bold text-slate-700 dark:text-slate-200 group-hover:text-brand-primary transition-colors"
        >
          Click to upload or drag images
        </p>
        <p class="text-sm text-slate-400 dark:text-slate-500">PNG, JPG, WebP · Multiple files supported</p>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        aria-label="File input"
        @change="onChange"
      />
    </div>

    <!-- Results -->
    <div v-else class="text-left mt-2 animate-fade-in">
      <div class="flex flex-col lg:flex-row gap-8">
        <div class="flex-1 space-y-6 min-w-0">
          <div
            v-for="(item, i) in items"
            :key="i"
            class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white dark:bg-theme-cardDark rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 animate-fade-in"
          >
            <!-- Original -->
            <div
              class="bg-white dark:bg-theme-cardDark rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700"
            >
              <div
                class="bg-gray-50 dark:bg-gray-800/80 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"
              >
                <h3 class="font-bold text-slate-700 dark:text-slate-200 text-xs">Original</h3>
                <div v-if="item.status === 'done'" class="text-[10px] font-mono text-slate-500">
                  {{ item.width }} × {{ item.height }} px
                </div>
              </div>
              <div class="p-3 checker flex justify-center h-64">
                <img v-if="item.originalSrc" :src="item.originalSrc" class="max-h-full object-contain rounded shadow-sm mx-auto" />
                <div v-else class="flex items-center justify-center">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
                </div>
              </div>
            </div>

            <!-- Cleaned -->
            <div
              class="bg-white dark:bg-theme-cardDark rounded-xl shadow-md overflow-hidden"
              :class="item.status === 'done' ? 'border border-green-500/40 ring-2 ring-green-500/20' : 'border border-brand-primary/30'"
            >
              <div
                class="px-3 py-2 border-b flex items-center gap-1"
                :class="item.status === 'done' ? 'bg-green-50 dark:bg-green-900/20 border-green-500/30' : 'bg-indigo-50 dark:bg-indigo-900/20 border-brand-primary/20'"
              >
                <template v-if="item.status === 'done'">
                  <iconify-icon icon="ph:check-circle-fill" width="16" class="text-green-600 dark:text-green-400"></iconify-icon>
                  <span class="font-bold text-green-600 dark:text-green-400 text-xs">Cleaned</span>
                </template>
                <span v-else class="font-bold text-brand-primary text-xs">Removing watermark…</span>
              </div>
              <div class="p-3 checker flex justify-center h-64">
                <img v-if="item.status === 'done'" :src="item.url" class="max-h-full object-contain rounded shadow-sm mx-auto" />
                <p v-else-if="item.status === 'error'" class="text-sm font-semibold text-red-500 self-center">Failed to process</p>
                <p v-else class="text-sm font-semibold text-brand-primary self-center">Removing watermark...</p>
              </div>
              <div v-if="item.status === 'done'" class="p-3 border-t border-green-500/20">
                <button
                  @click="downloadOne(item)"
                  class="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all active:scale-95"
                >
                  <iconify-icon icon="ph:download-simple-bold" width="16"></iconify-icon> Download
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Actions sidebar -->
        <div class="w-full lg:w-64 flex-shrink-0">
          <div
            class="bg-white dark:bg-theme-cardDark rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-5 sticky top-24"
          >
            <h2 class="font-bold text-slate-900 dark:text-white mb-4 text-base">Actions</h2>
            <button
              v-if="doneItems.length === 1"
              @click="downloadOne(doneItems[0])"
              class="group w-full py-3.5 relative overflow-hidden rounded-xl font-bold mb-3 text-white shadow-lg shadow-brand-primary/30 transition-all duration-300"
            >
              <div class="absolute inset-0 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent group-hover:scale-110 transition-transform duration-500"></div>
              <div class="relative flex items-center justify-center gap-2">
                <iconify-icon icon="ph:download-simple-bold" width="20"></iconify-icon> Download
              </div>
            </button>
            <button
              v-if="doneItems.length > 1"
              @click="downloadAll"
              class="group w-full py-3.5 relative overflow-hidden rounded-xl font-bold mb-3 text-white shadow-lg shadow-green-500/30 transition-all duration-300"
            >
              <div class="absolute inset-0 bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 group-hover:scale-110 transition-transform duration-500"></div>
              <div class="relative flex items-center justify-center gap-2">
                <iconify-icon icon="ph:file-zip-bold" width="20"></iconify-icon> Download All ZIP
              </div>
            </button>
            <button
              @click="reset"
              class="w-full py-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:border-brand-primary hover:text-brand-primary rounded-xl font-bold transition-all duration-300"
            >
              Process Another
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
