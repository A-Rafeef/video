<script setup>
import { ref, onMounted } from 'vue';

let enginePromise = null;
function getEngine() {
  if (!enginePromise) {
    enginePromise = import('../engine/videoEngine.js').then(({ VideoWatermarkEngine }) =>
      VideoWatermarkEngine.create()
    );
  }
  return enginePromise;
}

const fileInput = ref(null);
const dragOver = ref(false);
const supported = ref(true);
const status = ref('idle'); // idle | processing | done | error
const progress = ref(0);
const errorMsg = ref('');
const originalUrl = ref('');
const resultUrl = ref('');
const downloadName = ref('clean_video.webm');

onMounted(async () => {
  const { VideoWatermarkEngine } = await import('../engine/videoEngine.js');
  supported.value = VideoWatermarkEngine.isSupported();
});

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
  const file = Array.from(fileList).find((f) => f.type.startsWith('video/'));
  if (!file) return;

  reset();
  status.value = 'processing';
  progress.value = 0;

  let engine;
  try {
    engine = await getEngine();
  } catch {
    fail('Could not load the watermark engine.');
    return;
  }

  try {
    const result = await engine.process(file, ({ progress: p }) => {
      progress.value = p;
    });
    originalUrl.value = result.originalUrl;
    resultUrl.value = result.url;
    downloadName.value = `clean_${file.name.replace(/\.[^/.]+$/, '')}.${result.ext}`;
    status.value = 'done';
  } catch (err) {
    console.error(err);
    fail(err?.message || 'Something went wrong while processing the video.');
  }
}

function fail(msg) {
  errorMsg.value = msg;
  status.value = 'error';
}

function download() {
  const a = document.createElement('a');
  a.href = resultUrl.value;
  a.download = downloadName.value;
  a.click();
}

function reset() {
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value);
  if (originalUrl.value) URL.revokeObjectURL(originalUrl.value);
  originalUrl.value = '';
  resultUrl.value = '';
  errorMsg.value = '';
  progress.value = 0;
  status.value = 'idle';
  if (fileInput.value) fileInput.value.value = '';
}
</script>

<template>
  <div
    class="max-w-5xl mx-auto bg-white dark:bg-theme-cardDark rounded-3xl shadow-xl dark:shadow-none p-4 border border-gray-100 dark:border-gray-800 relative z-10 transition-colors"
  >
    <!-- Unsupported browser -->
    <div
      v-if="!supported"
      class="flex flex-col items-center justify-center w-full h-56 rounded-2xl bg-red-50/60 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-center px-6"
    >
      <iconify-icon icon="ph:warning-circle-bold" width="36" class="text-red-500 mb-2"></iconify-icon>
      <p class="font-bold text-red-600 dark:text-red-400">Your browser can't process video locally.</p>
      <p class="text-sm text-red-500/80 mt-1">Please try the latest Chrome, Edge, or Firefox on desktop.</p>
    </div>

    <!-- Upload -->
    <div
      v-else-if="status === 'idle'"
      class="group relative flex flex-col items-center justify-center w-full h-56 border-2 border-dashed rounded-2xl bg-gray-50/50 dark:bg-gray-800/50 transition-all cursor-pointer"
      :class="
        dragOver
          ? 'border-brand-primary bg-indigo-50/60 dark:bg-gray-800'
          : 'border-gray-300 dark:border-gray-700 hover:bg-indigo-50/50 dark:hover:bg-gray-800 hover:border-brand-primary'
      "
      role="button"
      tabindex="0"
      aria-label="Upload area — click to select a video or drag and drop"
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
            icon="ph:video-camera-bold"
            class="text-2xl text-gray-400 dark:text-gray-300 group-hover:text-brand-primary"
            aria-hidden="true"
          ></iconify-icon>
        </div>
        <p class="mb-1 text-base font-bold text-slate-700 dark:text-slate-200 group-hover:text-brand-primary transition-colors">
          Click to upload or drag a video
        </p>
        <p class="text-sm text-slate-400 dark:text-slate-500">MP4, WebM, MOV · Audio is preserved</p>
      </div>
      <input ref="fileInput" type="file" accept="video/*" class="hidden" aria-label="Video file input" @change="onChange" />
    </div>

    <!-- Processing -->
    <div v-else-if="status === 'processing'" class="flex flex-col items-center justify-center w-full h-56 px-8">
      <div class="w-14 h-14 rounded-full border-4 border-transparent border-t-brand-primary border-r-brand-secondary border-b-brand-accent animate-spin mb-4"></div>
      <p class="font-bold text-brand-primary mb-3">Removing watermark, frame by frame…</p>
      <div class="w-full max-w-md h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div class="h-full bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent transition-all duration-200" :style="{ width: `${Math.round(progress * 100)}%` }"></div>
      </div>
      <p class="text-xs text-slate-400 dark:text-slate-500 mt-2 font-medium">
        {{ Math.round(progress * 100) }}% — processing runs in real time, please keep this tab open.
      </p>
    </div>

    <!-- Error -->
    <div v-else-if="status === 'error'" class="flex flex-col items-center justify-center w-full min-h-56 py-10 text-center px-6">
      <iconify-icon icon="ph:warning-circle-bold" width="36" class="text-red-500 mb-2"></iconify-icon>
      <p class="font-bold text-red-600 dark:text-red-400">{{ errorMsg }}</p>
      <button
        @click="reset"
        class="mt-4 px-5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:border-brand-primary hover:text-brand-primary rounded-xl font-bold transition-all"
      >
        Try Another Video
      </button>
    </div>

    <!-- Done -->
    <div v-else class="text-left mt-2 animate-fade-in">
      <div class="flex flex-col lg:flex-row gap-8">
        <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
          <div class="bg-white dark:bg-theme-cardDark rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
            <div class="bg-gray-50 dark:bg-gray-800/80 px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-bold text-xs text-slate-700 dark:text-slate-200">Original</div>
            <div class="p-3 checker flex justify-center">
              <video :src="originalUrl" controls playsinline class="max-h-72 w-full object-contain rounded"></video>
            </div>
          </div>
          <div class="bg-white dark:bg-theme-cardDark rounded-xl shadow-md overflow-hidden border border-green-500/40 ring-2 ring-green-500/20">
            <div class="bg-green-50 dark:bg-green-900/20 px-3 py-2 border-b border-green-500/30 flex items-center gap-1">
              <iconify-icon icon="ph:check-circle-fill" width="16" class="text-green-600 dark:text-green-400"></iconify-icon>
              <span class="font-bold text-green-600 dark:text-green-400 text-xs">Cleaned</span>
            </div>
            <div class="p-3 checker flex justify-center">
              <video :src="resultUrl" controls playsinline class="max-h-72 w-full object-contain rounded"></video>
            </div>
          </div>
        </div>

        <div class="w-full lg:w-64 flex-shrink-0">
          <div class="bg-white dark:bg-theme-cardDark rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-5 sticky top-24">
            <h2 class="font-bold text-slate-900 dark:text-white mb-4 text-base">Actions</h2>
            <button
              @click="download"
              class="group w-full py-3.5 relative overflow-hidden rounded-xl font-bold mb-3 text-white shadow-lg shadow-brand-primary/30 transition-all duration-300"
            >
              <div class="absolute inset-0 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent group-hover:scale-110 transition-transform duration-500"></div>
              <div class="relative flex items-center justify-center gap-2">
                <iconify-icon icon="ph:download-simple-bold" width="20"></iconify-icon> Download
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
