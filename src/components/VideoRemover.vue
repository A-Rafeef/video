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
const addMoreFileInput = ref(null);
const dragOver = ref(false);
const supported = ref(true);

// Queue state: array of items
// item: { id, file, displayName, status: 'pending'|'processing'|'done'|'error', progress: 0..1, originalUrl, resultUrl, downloadName, errorMsg }
const items = ref([]);
const isProcessing = ref(false);

// Export mode: 'individual' (process sequentially one by one) or 'combine' (merge clips into single video)
const exportMode = ref('individual');
const selectedTransition = ref('fade'); // 'cut' | 'fade' | 'crossfade'
const transitionDuration = ref(0.5); // 0.5s or 1.0s

// Combined processing state
const combineStatus = ref('idle'); // 'idle' | 'processing' | 'done' | 'error'
const combineProgress = ref(0);
const combineCurrentFileIdx = ref(0);
const combineResultUrl = ref('');
const combineDownloadName = ref('combined_clean_video.mp4');
const combineErrorMsg = ref('');

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

// Single Video Advanced Tuner State
const tunerActive = ref(false);
const tunerLoading = ref(false);
const tunerFrame = ref(null); // { width, height, imageData }
const tunerBase = ref(null);
const tunerBgImg = ref(null);
let tunerFile = null;

const completedCount = computed(() => items.value.filter((i) => i.status === 'done').length);
const processingCount = computed(() => items.value.filter((i) => i.status === 'processing').length);
const pendingCount = computed(() => items.value.filter((i) => i.status === 'pending').length);
const errorCount = computed(() => items.value.filter((i) => i.status === 'error').length);
const totalCount = computed(() => items.value.length);
const hasQueue = computed(() => items.value.length > 0);

const overallProgress = computed(() => {
  if (totalCount.value === 0) return 0;
  let total = 0;
  items.value.forEach((item) => {
    if (item.status === 'done') total += 1;
    else if (item.status === 'processing') total += item.progress;
  });
  return total / totalCount.value;
});

onMounted(async () => {
  const { VideoWatermarkEngine } = await import('../engine/videoEngine.js');
  supported.value = VideoWatermarkEngine.isSupported();
});

function openPicker() { fileInput.value?.click(); }
function openAddMorePicker() { addMoreFileInput.value?.click(); }

function onDrop(e) {
  dragOver.value = false;
  handleFiles(e.dataTransfer.files);
}
function onChange(e) { handleFiles(e.target.files); }

async function handleFiles(fileList) {
  const validFiles = Array.from(fileList).filter((f) => f.type.startsWith('video/') || f.name.match(/\.(mp4|webm|mov|mkv|avi)$/i));
  if (!validFiles.length) return;

  let engine;
  try {
    engine = await getEngine();
  } catch (e) {
    console.error(e);
    alert('Could not initialize video processing engine.');
    return;
  }

  // If advanced mode is ON and only 1 file is uploaded, open Advanced Tuner
  if (advanced.value && validFiles.length === 1 && !hasQueue.value) {
    tunerFile = validFiles[0];
    tunerLoading.value = true;
    try {
      const f = await grabPreviewFrame(tunerFile);
      tunerFrame.value = f;
      tunerBase.value = engine.getVeoWatermark(f.width, f.height);
      tunerBgImg.value = engine.sparkleImage;
      tunerActive.value = true;
    } catch (err) {
      console.error(err);
      alert('Could not read video preview frame.');
    } finally {
      tunerLoading.value = false;
    }
    return;
  }

  // Otherwise, queue all valid files for batch sequential or combine processing
  validFiles.forEach((file) => {
    items.value.push({
      id: Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
      file,
      displayName: file.name,
      status: 'pending',
      progress: 0,
      originalUrl: URL.createObjectURL(file),
      resultUrl: '',
      downloadName: '',
      errorMsg: '',
    });
  });

  if (fileInput.value) fileInput.value.value = '';
  if (addMoreFileInput.value) addMoreFileInput.value.value = '';

  if (exportMode.value === 'individual') {
    processQueue();
  }
}

// Reordering Functions
function moveUp(index) {
  if (index <= 0) return;
  const temp = items.value[index];
  items.value[index] = items.value[index - 1];
  items.value[index - 1] = temp;
}

function moveDown(index) {
  if (index >= items.value.length - 1) return;
  const temp = items.value[index];
  items.value[index] = items.value[index + 1];
  items.value[index + 1] = temp;
}

async function processQueue() {
  if (isProcessing.value) return;
  isProcessing.value = true;

  let engine;
  try {
    engine = await getEngine();
  } catch (e) {
    console.error(e);
    isProcessing.value = false;
    return;
  }

  while (true) {
    const item = items.value.find((i) => i.status === 'pending');
    if (!item) break;

    item.status = 'processing';
    item.progress = 0;
    item.originalUrl = URL.createObjectURL(item.file);

    try {
      const result = await engine.process(item.file, {
        ...settings,
        onProgress: ({ progress: p }) => {
          item.progress = p;
        },
      });

      item.resultUrl = result.url;
      item.downloadName = `clean_${item.file.name.replace(/\.[^/.]+$/, '')}.${result.ext}`;
      item.status = 'done';
    } catch (e) {
      console.error('Error processing video:', item.displayName, e);
      item.status = 'error';
      item.errorMsg = e?.message || 'Something went wrong while processing the video.';
    }
  }

  isProcessing.value = false;
}

async function startCombineProcess() {
  if (!items.value.length) return;
  combineStatus.value = 'processing';
  combineProgress.value = 0;
  combineErrorMsg.value = '';

  try {
    const engine = await getEngine();
    const filesList = items.value.map((i) => i.file);
    const result = await engine.combineProcess(filesList, {
      ...settings,
      transition: selectedTransition.value,
      transitionDuration: Number(transitionDuration.value),
      onProgress: ({ progress: p, currentFileIndex }) => {
        combineProgress.value = p;
        combineCurrentFileIdx.value = currentFileIndex;
      },
    });

    combineResultUrl.value = result.url;
    combineDownloadName.value = `clean_combined_${Date.now()}.${result.ext}`;
    combineStatus.value = 'done';
  } catch (e) {
    console.error('Combine error:', e);
    combineStatus.value = 'error';
    combineErrorMsg.value = e?.message || 'Could not combine the videos.';
  }
}

function retryItem(item) {
  item.status = 'pending';
  item.progress = 0;
  item.errorMsg = '';
  if (exportMode.value === 'individual') processQueue();
}

function removeItem(index) {
  const item = items.value[index];
  if (item) {
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
    items.value.splice(index, 1);
  }
}

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

async function exportTuner() {
  if (!tunerFile) return;
  tunerActive.value = false;
  items.value.push({
    id: Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
    file: tunerFile,
    displayName: tunerFile.name,
    status: 'pending',
    progress: 0,
    originalUrl: URL.createObjectURL(tunerFile),
    resultUrl: '',
    downloadName: '',
    errorMsg: '',
  });
  tunerFile = null;
  if (exportMode.value === 'individual') processQueue();
}

function downloadOne(item) {
  if (!item.resultUrl) return;
  const a = document.createElement('a');
  a.href = item.resultUrl;
  a.download = item.downloadName;
  a.click();
}

function downloadCombined() {
  if (!combineResultUrl.value) return;
  const a = document.createElement('a');
  a.href = combineResultUrl.value;
  a.download = combineDownloadName.value;
  a.click();
}

function reset() {
  items.value.forEach((item) => {
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
  });
  items.value = [];
  if (combineResultUrl.value) URL.revokeObjectURL(combineResultUrl.value);
  combineResultUrl.value = '';
  combineStatus.value = 'idle';
  tunerActive.value = false;
  tunerFile = null;
  tunerFrame.value = null;
  if (fileInput.value) fileInput.value.value = '';
  if (addMoreFileInput.value) addMoreFileInput.value.value = '';
}
</script>

<template>
  <div
    class="max-w-5xl mx-auto bg-white dark:bg-theme-cardDark rounded-3xl shadow-xl dark:shadow-none p-4 border border-gray-100 dark:border-gray-800 relative z-10 transition-colors"
  >
    <!-- Unsupported browser message -->
    <div
      v-if="!supported"
      class="flex flex-col items-center justify-center w-full h-56 rounded-2xl bg-red-50/60 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-center px-6"
    >
      <iconify-icon icon="ph:warning-circle-bold" width="36" class="text-red-500 mb-2"></iconify-icon>
      <p class="font-bold text-red-600 dark:text-red-400">Your browser can't process video locally.</p>
      <p class="text-sm text-red-500/80 mt-1">Please try the latest Chrome or Edge on desktop.</p>
    </div>

    <!-- Advanced Single Video Tuner View -->
    <div v-else-if="tunerActive" class="animate-fade-in">
      <div class="flex flex-col lg:flex-row gap-6">
        <div class="flex-1 min-w-0">
          <WatermarkTuner :settings="settings" :frame="tunerFrame" :bg-img="tunerBgImg" :base="tunerBase" />
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-3 leading-relaxed">
            Adjust the sliders until the watermark disappears in the zoomed corner. The
            <span class="text-brand-primary font-semibold">blue box</span> shows what gets cleaned.
          </p>
        </div>

        <div class="w-full lg:w-60 flex-shrink-0">
          <div class="bg-white dark:bg-theme-cardDark rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-5 space-y-3 sticky top-24">
            <h2 class="font-bold text-slate-900 dark:text-white text-base">Export Settings</h2>
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
            <button @click="exportTuner" class="group w-full py-3 relative overflow-hidden rounded-xl font-bold text-white shadow-lg shadow-brand-primary/30 transition-all">
              <div class="absolute inset-0 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent group-hover:scale-110 transition-transform duration-500"></div>
              <div class="relative flex items-center justify-center gap-2">
                <iconify-icon icon="ph:sparkle-fill" width="18"></iconify-icon> Remove &amp; Queue Video
              </div>
            </button>
            <button @click="reset" class="w-full py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:border-brand-primary hover:text-brand-primary rounded-xl font-bold transition-all">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading Tuner Preview -->
    <div v-else-if="tunerLoading" class="flex flex-col items-center justify-center w-full h-56">
      <div class="w-12 h-12 rounded-full border-4 border-transparent border-t-brand-primary border-r-brand-secondary border-b-brand-accent animate-spin mb-3"></div>
      <p class="font-bold text-brand-primary">Loading tuner preview frame…</p>
    </div>

    <!-- Upload Box (When Queue is empty) -->
    <div
      v-else-if="!hasQueue"
      class="group relative flex flex-col items-center justify-center w-full min-h-[14rem] py-8 border-2 border-dashed rounded-2xl bg-gray-50/50 dark:bg-gray-800/50 transition-all duration-300 ease-out cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
      :class="dragOver ? 'border-brand-primary bg-indigo-50/60 dark:bg-gray-800 scale-[1.02] shadow-lg shadow-brand-primary/10' : 'border-gray-300 dark:border-gray-700 hover:bg-indigo-50/50 dark:hover:bg-gray-800 hover:border-brand-primary'"
      role="button" tabindex="0" aria-label="Upload video files"
      @click="openPicker" @keydown.enter="openPicker"
      @dragover.prevent="dragOver = true" @dragenter.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false" @drop.prevent="onDrop"
    >
      <div class="flex flex-col items-center justify-center">
        <div class="w-14 h-14 bg-white dark:bg-gray-700 rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
          <iconify-icon icon="ph:video-camera-bold" class="text-2xl text-gray-400 dark:text-gray-300 group-hover:text-brand-primary" aria-hidden="true"></iconify-icon>
        </div>
        <p class="mb-1 text-base font-bold text-slate-700 dark:text-slate-200 group-hover:text-brand-primary transition-colors text-center">
          Click to upload or drag video files (Multiple allowed)
        </p>
        <p class="text-sm text-slate-400 dark:text-slate-500">MP4, WebM, MOV · Process sequentially or merge with transitions</p>
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
          <p class="text-[11px] text-slate-400 dark:text-slate-500 max-w-xs text-center">{{ currentPreset.desc }}</p>
        </div>
        <label class="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer" @click.stop>
          <input type="checkbox" v-model="advanced" class="accent-brand-primary w-3.5 h-3.5" />
          Advanced: tune it yourself (single video)
        </label>
      </div>
      <input ref="fileInput" type="file" accept="video/*" multiple class="hidden" aria-label="Video file input" @change="onChange" />
    </div>

    <!-- Batch Video Queue & Reordering / Combining Dashboard -->
    <div v-else class="text-left animate-fade-in space-y-6">
      <!-- Mode Selection & Options Card -->
      <div class="bg-white dark:bg-theme-cardDark p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <iconify-icon icon="ph:film-strip-bold" class="text-brand-primary"></iconify-icon> Output Processing Mode
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">Choose whether to process videos individually or combine them into a single merged video.</p>
          </div>

          <!-- Mode Toggle Buttons -->
          <div class="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
            <button
              @click="exportMode = 'individual'; processQueue()"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              :class="exportMode === 'individual' ? 'bg-white dark:bg-gray-700 text-brand-primary shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
            >
              <iconify-icon icon="ph:scissors-bold"></iconify-icon> Process Separately
            </button>
            <button
              @click="exportMode = 'combine'"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              :class="exportMode === 'combine' ? 'bg-white dark:bg-gray-700 text-brand-primary shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
            >
              <iconify-icon icon="ph:intersect-bold"></iconify-icon> Merge &amp; Combine
            </button>
          </div>
        </div>

        <!-- Transition Settings (Visible only when Combine Mode is active) -->
        <div v-if="exportMode === 'combine'" class="pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end animate-fade-in">
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Transition Effect</label>
            <select
              v-model="selectedTransition"
              class="w-full text-xs font-semibold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-brand-primary/50"
            >
              <option value="fade">Fade to Black (Smooth)</option>
              <option value="crossfade">Crossfade (Dissolve)</option>
              <option value="cut">Direct Cut (Seamless)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Transition Duration</label>
            <select
              v-model="transitionDuration"
              class="w-full text-xs font-semibold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-brand-primary/50"
            >
              <option :value="0.5">0.5 seconds</option>
              <option :value="1.0">1.0 second</option>
            </select>
          </div>

          <div class="flex items-center gap-2">
            <button
              @click="startCombineProcess"
              :disabled="combineStatus === 'processing'"
              class="w-full py-2.5 px-4 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent text-white font-bold text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <iconify-icon icon="ph:sparkle-fill" width="16"></iconify-icon>
              {{ combineStatus === 'processing' ? 'Combining Videos...' : 'Process & Combine All Videos' }}
            </button>
          </div>
        </div>

        <!-- Video Sequence Timeline Preview (Filmstrip with Thumbnails) -->
        <div v-if="exportMode === 'combine' && items.length > 0" class="pt-3 border-t border-gray-100 dark:border-gray-800 animate-fade-in">
          <div class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <iconify-icon icon="ph:film-strip-bold" class="text-brand-primary"></iconify-icon> Combined Sequence Preview ({{ items.length }} clips)
            </span>
            <span class="text-[11px] text-slate-400 font-normal">Reorder below via ▲ ▼ arrows</span>
          </div>
          <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            <template v-for="(clip, idx) in items" :key="clip.id">
              <!-- Thumbnail preview card in sequence -->
              <div class="relative flex-shrink-0 w-24 h-16 rounded-xl overflow-hidden bg-slate-900 border-2 border-indigo-500/30 group shadow-sm">
                <video v-if="clip.originalUrl" :src="clip.originalUrl + '#t=0.5'" preload="metadata" muted playsinline class="w-full h-full object-cover pointer-events-none"></video>
                <div v-else class="w-full h-full bg-slate-800 flex items-center justify-center text-slate-500">
                  <iconify-icon icon="ph:video-camera-bold" width="18"></iconify-icon>
                </div>
                <div class="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-white font-mono font-bold text-[10px] shadow-sm">
                  #{{ idx + 1 }}
                </div>
                <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1">
                  <p class="text-[10px] font-semibold text-white truncate text-center m-0">{{ clip.displayName }}</p>
                </div>
              </div>

              <!-- Transition effect indicator icon between thumbnails -->
              <div v-if="idx < items.length - 1" class="flex-shrink-0 flex flex-col items-center justify-center px-1 text-brand-primary">
                <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{{ selectedTransition }}</span>
                <iconify-icon icon="ph:caret-right-bold" width="16" class="text-brand-primary"></iconify-icon>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Combined Result Card (When Combine Mode finishes) -->
      <div v-if="exportMode === 'combine' && combineStatus === 'done'" class="bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-500/40 rounded-2xl p-5 space-y-4 animate-fade-in">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <iconify-icon icon="ph:check-circle-fill" width="22" class="text-green-600 dark:text-green-400"></iconify-icon>
            <h3 class="font-bold text-sm text-green-800 dark:text-green-300">Combined Cleaned Video Ready!</h3>
          </div>
          <button
            @click="downloadCombined"
            class="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
          >
            <iconify-icon icon="ph:download-simple-bold" width="16"></iconify-icon> Download Combined MP4
          </button>
        </div>
        <div class="p-3 checker flex justify-center rounded-xl overflow-hidden border border-green-500/30">
          <video :src="combineResultUrl" controls playsinline class="max-h-80 w-full object-contain rounded"></video>
        </div>
      </div>

      <!-- Combined Processing Progress -->
      <div v-else-if="exportMode === 'combine' && combineStatus === 'processing'" class="bg-white dark:bg-theme-cardDark p-5 rounded-2xl border border-brand-primary/40 space-y-3">
        <div class="flex justify-between items-center text-xs font-bold text-brand-primary">
          <span>Combining &amp; Applying Transitions (Clip {{ combineCurrentFileIdx + 1 }}/{{ totalCount }})</span>
          <span>{{ Math.round(combineProgress * 100) }}%</span>
        </div>
        <div class="w-full h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent transition-all duration-200" :style="{ width: `${Math.round(combineProgress * 100)}%` }"></div>
        </div>
        <p class="text-[11px] text-slate-400 dark:text-slate-500">Merging video sequence with clean frames... Please keep this tab open.</p>
      </div>

      <!-- Combined Error -->
      <div v-else-if="exportMode === 'combine' && combineStatus === 'error'" class="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-2xl text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
        <span>{{ combineErrorMsg }}</span>
        <button @click="startCombineProcess" class="px-3 py-1.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">Retry Combine</button>
      </div>

      <!-- Summary Header Bar -->
      <div class="bg-gradient-to-r from-indigo-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-800 dark:via-gray-800/90 dark:to-gray-800/80 p-5 rounded-2xl border border-indigo-100 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-4 w-full md:w-auto">
          <div class="w-12 h-12 rounded-2xl bg-brand-primary/10 dark:bg-brand-primary/20 flex items-center justify-center text-brand-primary flex-shrink-0">
            <iconify-icon v-if="exportMode === 'individual' && (pendingCount > 0 || processingCount > 0)" icon="ph:sparkle-fill" class="text-2xl animate-pulse"></iconify-icon>
            <iconify-icon v-else icon="ph:film-strip-bold" class="text-2xl text-brand-primary"></iconify-icon>
          </div>
          <div>
            <h2 class="text-base font-bold text-slate-800 dark:text-white">
              <template v-if="exportMode === 'individual'">
                <span v-if="processingCount > 0">Processing videos sequentially… ({{ completedCount + 1 }}/{{ totalCount }})</span>
                <span v-else-if="pendingCount > 0">Queued: {{ pendingCount }} video(s) remaining</span>
                <span v-else>All {{ completedCount }} video(s) processed!</span>
              </template>
              <template v-else>
                <span>Video Queue ({{ totalCount }} clips ready to merge)</span>
              </template>
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Use ▲ ▼ arrows on video cards to adjust playback sequence order.
            </p>
          </div>
        </div>

        <!-- Right Side Controls & Add More Button -->
        <div class="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            @click="openAddMorePicker"
            class="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-brand-primary bg-white dark:bg-gray-800 hover:bg-brand-primary/10 border border-brand-primary/30 rounded-xl transition-all shadow-sm"
          >
            <iconify-icon icon="ph:plus-bold" width="16"></iconify-icon> Add More Videos
          </button>
          <input ref="addMoreFileInput" type="file" accept="video/*" multiple class="hidden" aria-label="Add more video files" @change="onChange" />
          <button
            @click="reset"
            class="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 rounded-xl transition-all shadow-sm"
          >
            Clear All
          </button>
        </div>
      </div>

      <!-- Overall Queue Progress Bar (Individual Mode) -->
      <div v-if="exportMode === 'individual' && (processingCount > 0 || pendingCount > 0)" class="w-full bg-gray-100 dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
        <div class="flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
          <span>Overall Batch Progress</span>
          <span>{{ Math.round(overallProgress * 100) }}%</span>
        </div>
        <div class="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent transition-all duration-300"
            :style="{ width: `${Math.round(overallProgress * 100)}%` }"
          ></div>
        </div>
      </div>

      <!-- Video Queue Items List with Reordering Controls -->
      <div class="space-y-4">
        <div
          v-for="(item, index) in items"
          :key="item.id"
          class="bg-white dark:bg-theme-cardDark rounded-2xl border transition-all p-5 shadow-sm hover:shadow-md"
          :class="{
            'border-green-500/40 dark:border-green-500/30 bg-green-50/10': exportMode === 'individual' && item.status === 'done',
            'border-brand-primary dark:border-brand-primary/50 ring-2 ring-brand-primary/20': exportMode === 'individual' && item.status === 'processing',
            'border-gray-200 dark:border-gray-800': item.status === 'pending' || exportMode === 'combine',
            'border-red-300 dark:border-red-900/50 bg-red-50/10': item.status === 'error',
          }"
        >
          <!-- Item Card Header with Reordering & Index Badge -->
          <div class="flex items-center justify-between gap-4 mb-3">
            <div class="flex items-center gap-3 min-w-0">
              <!-- Clip Sequence Number Badge -->
              <div class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-gray-800 text-brand-primary font-mono font-bold text-xs border border-indigo-100 dark:border-gray-700">
                #{{ index + 1 }}
              </div>

              <!-- Reorder Buttons (Move Up / Move Down) -->
              <div class="flex items-center gap-1">
                <button
                  @click="moveUp(index)"
                  :disabled="index === 0"
                  class="p-1.5 text-slate-500 dark:text-slate-400 hover:text-brand-primary disabled:opacity-30 disabled:hover:text-slate-500 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Move Up in sequence"
                >
                  <iconify-icon icon="ph:arrow-up-bold" width="16"></iconify-icon>
                </button>
                <button
                  @click="moveDown(index)"
                  :disabled="index === items.length - 1"
                  class="p-1.5 text-slate-500 dark:text-slate-400 hover:text-brand-primary disabled:opacity-30 disabled:hover:text-slate-500 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Move Down in sequence"
                >
                  <iconify-icon icon="ph:arrow-down-bold" width="16"></iconify-icon>
                </button>
              </div>

              <!-- Video Thumbnail Preview -->
              <div class="relative w-20 h-14 rounded-xl overflow-hidden bg-slate-900 border border-gray-200 dark:border-gray-700 shrink-0 group/thumb shadow-sm">
                <video
                  v-if="item.originalUrl"
                  :src="item.originalUrl + '#t=0.5'"
                  preload="metadata"
                  muted
                  playsinline
                  class="w-full h-full object-cover pointer-events-none"
                ></video>
                <div v-else class="w-full h-full bg-slate-800 flex items-center justify-center text-slate-500">
                  <iconify-icon icon="ph:video-camera-bold" width="18"></iconify-icon>
                </div>
                <div class="absolute inset-0 bg-black/25 flex items-center justify-center">
                  <div class="w-6 h-6 rounded-full bg-black/50 backdrop-blur-xs flex items-center justify-center text-white">
                    <iconify-icon icon="ph:play-fill" width="10"></iconify-icon>
                  </div>
                </div>
              </div>

              <div class="min-w-0">
                <h3 class="font-bold text-sm text-slate-800 dark:text-slate-100 truncate" :title="item.displayName">
                  {{ item.displayName }}
                </h3>
                <span v-if="exportMode === 'individual'" class="text-xs font-semibold"
                  :class="{
                    'text-green-600 dark:text-green-400': item.status === 'done',
                    'text-brand-primary font-bold': item.status === 'processing',
                    'text-slate-400 dark:text-slate-500': item.status === 'pending',
                    'text-red-500 dark:text-red-400': item.status === 'error',
                  }"
                >
                  <template v-if="item.status === 'done'">Cleaned &amp; Ready</template>
                  <template v-else-if="item.status === 'processing'">Processing... {{ Math.round(item.progress * 100) }}%</template>
                  <template v-else-if="item.status === 'pending'">Waiting in queue...</template>
                  <template v-else>Processing Failed</template>
                </span>
                <span v-else class="text-xs text-slate-400 dark:text-slate-500 font-semibold">
                  Clip #{{ index + 1 }} in combined sequence
                </span>
              </div>
            </div>

            <!-- Remove Button -->
            <button
              @click="removeItem(index)"
              class="p-2 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Remove from queue"
            >
              <iconify-icon icon="ph:trash-bold" width="18"></iconify-icon>
            </button>
          </div>

          <!-- Individual Processing State Indicator -->
          <div v-if="exportMode === 'individual' && item.status === 'processing'" class="mt-2 space-y-2">
            <div class="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent transition-all duration-150"
                :style="{ width: `${Math.round(item.progress * 100)}%` }"
              ></div>
            </div>
            <p class="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
              Cleaning watermark &amp; re-encoding frames... Please do not close this tab.
            </p>
          </div>

          <!-- Error State -->
          <div v-else-if="item.status === 'error'" class="mt-2 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded-xl border border-red-200 dark:border-red-900/40 flex items-center justify-between gap-3">
            <span>{{ item.errorMsg }}</span>
            <button
              @click="retryItem(item)"
              class="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors flex items-center gap-1 flex-shrink-0"
            >
              <iconify-icon icon="ph:arrow-clockwise-bold"></iconify-icon> Retry
            </button>
          </div>

          <!-- Done State for Individual Mode: Side-by-side Comparison & Download -->
          <div v-else-if="exportMode === 'individual' && item.status === 'done'" class="mt-3 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Original Video -->
              <div class="bg-gray-50 dark:bg-gray-800/60 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <div class="bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 border-b border-gray-200 dark:border-gray-700">
                  Original
                </div>
                <div class="p-2 checker flex justify-center">
                  <video :src="item.originalUrl" controls playsinline class="max-h-60 w-full object-contain rounded"></video>
                </div>
              </div>

              <!-- Cleaned Video -->
              <div class="bg-green-50/40 dark:bg-green-950/20 rounded-xl overflow-hidden border border-green-500/40">
                <div class="bg-green-100/60 dark:bg-green-900/40 px-3 py-1.5 text-xs font-bold text-green-700 dark:text-green-300 border-b border-green-500/30 flex items-center gap-1">
                  <iconify-icon icon="ph:check-circle-fill" width="14"></iconify-icon> Cleaned Result
                </div>
                <div class="p-2 checker flex justify-center">
                  <video :src="item.resultUrl" controls playsinline class="max-h-60 w-full object-contain rounded"></video>
                </div>
              </div>
            </div>

            <!-- Download Button -->
            <div class="flex justify-end">
              <button
                @click="downloadOne(item)"
                class="flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all shadow-md shadow-green-600/20 active:scale-95"
              >
                <iconify-icon icon="ph:download-simple-bold" width="16"></iconify-icon> Download Cleaned Video
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
