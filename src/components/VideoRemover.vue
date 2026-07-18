<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import WatermarkTuner from './WatermarkTuner.vue';

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
const status = ref('idle'); // idle | loading | preview | processing | done | error
const progress = ref(0);
const errorMsg = ref('');

const originalUrl = ref('');
const resultUrl = ref('');
const downloadName = ref('clean_video.mp4');

// Advanced "tune-it-yourself" mode (off = one-click auto removal)
const advanced = ref(false);

// Watermark position presets for Veo videos. Each carries its own tuned settings.
const VIDEO_PRESETS = [
  {
    id: 'veo',
    label: 'Veo videos (default)',
    desc: 'Current Veo downloads — watermark slightly inset from the bottom-right corner.',
    settings: { gain: 0.6, offsetX: -24, offsetY: -24, sizeScale: 1 },
  },
  {
    id: 'corner',
    label: 'Classic corner',
    desc: 'Watermark right in the bottom-right corner.',
    settings: { gain: 0.6, offsetX: 0, offsetY: 0, sizeScale: 1 },
  },
];
const presetId = ref('veo');
const currentPreset = computed(() => VIDEO_PRESETS.find((p) => p.id === presetId.value));
const settings = reactive({ ...VIDEO_PRESETS[0].settings });

// Switching preset re-seeds the sliders with that preset's settings.
watch(presetId, () => {
  Object.assign(settings, currentPreset.value.settings);
});

// Preview state
const frame = ref(null); // { width, height, imageData }
const base = ref(null);
const bgImg = ref(null);
let engine = null;
let currentFile = null;

onMounted(async () => {
  const { VideoWatermarkEngine } = await import('../engine/videoEngine.js');
  supported.value = VideoWatermarkEngine.isSupported();
});

function openPicker() { fileInput.value?.click(); }
function onDrop(e) { dragOver.value = false; handleFiles(e.dataTransfer.files); }
function onChange(e) { handleFiles(e.target.files); }

async function handleFiles(fileList) {
  const file = Array.from(fileList).find((f) => f.type.startsWith('video/'));
  if (!file) return;
  reset();
  currentFile = file;
  status.value = 'loading';

  try {
    engine = await getEngine();
    if (!advanced.value) {
      await runExport(); // one-click with proven defaults
      return;
    }
    const f = await grabPreviewFrame(file);
    frame.value = f;
    base.value = engine.getVeoWatermark(f.width, f.height);
    bgImg.value = engine.sparkleImage;
    status.value = 'preview';
  } catch (e) {
    console.error(e);
    fail(e?.message || 'Could not read this video.');
  }
}

// Decode a representative frame with a <video> element (no WebCodecs needed).
function grabPreviewFrame(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    v.src = url;

    const cleanup = () => URL.revokeObjectURL(url);
    v.onerror = () => { cleanup(); reject(new Error('Could not read this video file.')); };
    v.onloadedmetadata = () => {
      const seekTo = Math.min(Math.max((v.duration || 1) * 0.3, 0.1), (v.duration || 1) - 0.05 || 0.1);
      const onSeeked = () => {
        try {
          const w = v.videoWidth, h = v.videoHeight;
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const cx = c.getContext('2d', { willReadFrequently: true });
          cx.drawImage(v, 0, 0, w, h);
          const imageData = cx.getImageData(0, 0, w, h);
          cleanup();
          resolve({ width: w, height: h, imageData });
        } catch (err) { cleanup(); reject(err); }
      };
      v.onseeked = onSeeked;
      try { v.currentTime = seekTo; } catch { onSeeked(); }
    };
  });
}

function resetSettings() {
  Object.assign(settings, currentPreset.value.settings);
}

async function runExport() {
  if (!currentFile) return;
  status.value = 'processing';
  progress.value = 0;
  try {
    const result = await engine.process(currentFile, {
      ...settings,
      onProgress: ({ progress: p }) => { progress.value = p; },
    });
    originalUrl.value = result.originalUrl;
    resultUrl.value = result.url;
    downloadName.value = `clean_${currentFile.name.replace(/\.[^/.]+$/, '')}.${result.ext}`;
    status.value = 'done';
  } catch (e) {
    console.error(e);
    fail(e?.message || 'Something went wrong while processing the video.');
  }
}

function backToPreview() {
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value);
  if (originalUrl.value) URL.revokeObjectURL(originalUrl.value);
  resultUrl.value = '';
  originalUrl.value = '';
  status.value = 'preview';
}

function download() {
  const a = document.createElement('a');
  a.href = resultUrl.value;
  a.download = downloadName.value;
  a.click();
}

function fail(msg) { errorMsg.value = msg; status.value = 'error'; }

function reset() {
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value);
  if (originalUrl.value) URL.revokeObjectURL(originalUrl.value);
  resultUrl.value = '';
  originalUrl.value = '';
  errorMsg.value = '';
  progress.value = 0;
  status.value = 'idle';
  currentFile = null;
  frame.value = null;
  if (fileInput.value) fileInput.value.value = '';
}
</script>

<template>
  <div
    class="max-w-5xl mx-auto bg-white dark:bg-theme-cardDark rounded-3xl shadow-xl dark:shadow-none p-4 border border-gray-100 dark:border-gray-800 relative z-10 transition-colors"
  >
    <!-- Unsupported -->
    <div
      v-if="!supported"
      class="flex flex-col items-center justify-center w-full h-56 rounded-2xl bg-red-50/60 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-center px-6"
    >
      <iconify-icon icon="ph:warning-circle-bold" width="36" class="text-red-500 mb-2"></iconify-icon>
      <p class="font-bold text-red-600 dark:text-red-400">Your browser can't process video locally.</p>
      <p class="text-sm text-red-500/80 mt-1">Please try the latest Chrome or Edge on desktop.</p>
    </div>

    <!-- Upload -->
    <div
      v-else-if="status === 'idle'"
      class="group relative flex flex-col items-center justify-center w-full min-h-[14rem] py-8 border-2 border-dashed rounded-2xl bg-gray-50/50 dark:bg-gray-800/50 transition-all cursor-pointer"
      :class="dragOver ? 'border-brand-primary bg-indigo-50/60 dark:bg-gray-800' : 'border-gray-300 dark:border-gray-700 hover:bg-indigo-50/50 dark:hover:bg-gray-800 hover:border-brand-primary'"
      role="button" tabindex="0" aria-label="Upload a video"
      @click="openPicker" @keydown.enter="openPicker"
      @dragover.prevent="dragOver = true" @dragenter.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false" @drop.prevent="onDrop"
    >
      <div class="flex flex-col items-center justify-center">
        <div class="w-14 h-14 bg-white dark:bg-gray-700 rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
          <iconify-icon icon="ph:video-camera-bold" class="text-2xl text-gray-400 dark:text-gray-300 group-hover:text-brand-primary" aria-hidden="true"></iconify-icon>
        </div>
        <p class="mb-1 text-base font-bold text-slate-700 dark:text-slate-200 group-hover:text-brand-primary transition-colors">
          Click to upload or drag a Gemini Veo video
        </p>
        <p class="text-sm text-slate-400 dark:text-slate-500">MP4, WebM, MOV · Audio is preserved</p>
        <div class="mt-4 flex flex-col items-center gap-1.5" @click.stop>
          <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Watermark position:
            <select
              v-model="presetId"
              class="text-xs font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 cursor-pointer"
            >
              <option v-for="p in VIDEO_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
            </select>
          </label>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 max-w-xs">{{ currentPreset.desc }}</p>
        </div>
        <label class="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer" @click.stop>
          <input type="checkbox" v-model="advanced" class="accent-brand-primary w-3.5 h-3.5" />
          Advanced: tune it yourself
        </label>
      </div>
      <input ref="fileInput" type="file" accept="video/*" class="hidden" aria-label="Video file input" @change="onChange" />
    </div>

    <!-- Loading the preview frame -->
    <div v-else-if="status === 'loading'" class="flex flex-col items-center justify-center w-full h-56">
      <div class="w-12 h-12 rounded-full border-4 border-transparent border-t-brand-primary border-r-brand-secondary border-b-brand-accent animate-spin mb-3"></div>
      <p class="font-bold text-brand-primary">Loading preview…</p>
    </div>

    <!-- Preview + manual controls -->
    <div v-else-if="status === 'preview'" class="animate-fade-in">
      <div class="flex flex-col lg:flex-row gap-6">
        <div class="flex-1 min-w-0">
          <WatermarkTuner :settings="settings" :frame="frame" :bg-img="bgImg" :base="base" />
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-3 leading-relaxed">
            Adjust the sliders until the watermark disappears in the zoomed corner. The
            <span class="text-brand-primary font-semibold">blue box</span> shows what gets cleaned.
          </p>
        </div>

        <div class="w-full lg:w-60 flex-shrink-0">
          <div class="bg-white dark:bg-theme-cardDark rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-5 space-y-3 sticky top-24">
            <h2 class="font-bold text-slate-900 dark:text-white text-base">Export</h2>
            <label class="block">
              <div class="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Position preset</div>
              <select
                v-model="presetId"
                class="w-full text-xs font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 cursor-pointer"
              >
                <option v-for="p in VIDEO_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
              <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{{ currentPreset.desc }}</p>
            </label>
            <button @click="resetSettings" class="w-full text-xs font-semibold text-slate-500 hover:text-brand-primary transition-colors">
              Reset sliders to preset
            </button>
            <button @click="runExport" class="group w-full py-3 relative overflow-hidden rounded-xl font-bold text-white shadow-lg shadow-brand-primary/30 transition-all">
              <div class="absolute inset-0 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent group-hover:scale-110 transition-transform duration-500"></div>
              <div class="relative flex items-center justify-center gap-2">
                <iconify-icon icon="ph:sparkle-fill" width="18"></iconify-icon> Remove &amp; Export
              </div>
            </button>
            <button @click="reset" class="w-full py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:border-brand-primary hover:text-brand-primary rounded-xl font-bold transition-all">
              Choose another video
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Processing -->
    <div v-else-if="status === 'processing'" class="flex flex-col items-center justify-center w-full h-56 px-8">
      <div class="w-14 h-14 rounded-full border-4 border-transparent border-t-brand-primary border-r-brand-secondary border-b-brand-accent animate-spin mb-4"></div>
      <p class="font-bold text-brand-primary mb-3">Cleaning &amp; re-encoding…</p>
      <div class="w-full max-w-md h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div class="h-full bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent transition-all duration-200" :style="{ width: `${Math.round(progress * 100)}%` }"></div>
      </div>
      <p class="text-xs text-slate-400 dark:text-slate-500 mt-2 font-medium">{{ Math.round(progress * 100) }}% — please keep this tab open.</p>
    </div>

    <!-- Error -->
    <div v-else-if="status === 'error'" class="flex flex-col items-center justify-center w-full min-h-56 py-10 text-center px-6">
      <iconify-icon icon="ph:warning-circle-bold" width="36" class="text-red-500 mb-2"></iconify-icon>
      <p class="font-bold text-red-600 dark:text-red-400">{{ errorMsg }}</p>
      <button @click="reset" class="mt-4 px-5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:border-brand-primary hover:text-brand-primary rounded-xl font-bold transition-all">
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
            <button @click="download" class="group w-full py-3.5 relative overflow-hidden rounded-xl font-bold mb-3 text-white shadow-lg shadow-brand-primary/30 transition-all duration-300">
              <div class="absolute inset-0 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent group-hover:scale-110 transition-transform duration-500"></div>
              <div class="relative flex items-center justify-center gap-2">
                <iconify-icon icon="ph:download-simple-bold" width="20"></iconify-icon> Download
              </div>
            </button>
            <button v-if="advanced" @click="backToPreview" class="w-full py-3 mb-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:border-brand-primary hover:text-brand-primary rounded-xl font-bold transition-all">
              Adjust &amp; re-run
            </button>
            <button @click="reset" class="w-full py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:border-brand-primary hover:text-brand-primary rounded-xl font-bold transition-all">
              Process Another
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
