<script setup>
import { ref } from 'vue';
import SiteHeader from './components/SiteHeader.vue';
import SiteFooter from './components/SiteFooter.vue';
import NotificationBanner from './components/NotificationBanner.vue';
import BeforeAfter from './components/BeforeAfter.vue';
import ImageRemover from './components/ImageRemover.vue';
import VideoRemover from './components/VideoRemover.vue';
import SupportPopup from './components/SupportPopup.vue';

const tab = ref('image'); // 'image' | 'video'
</script>

<template>
  <SiteHeader />
  <NotificationBanner />

  <main class="flex-grow w-full">
    <section class="py-10 md:py-14 text-center px-4" aria-labelledby="hero-heading">
      <!-- Hero -->
      <h1
        id="hero-heading"
        class="text-3xl md:text-5xl font-extrabold mb-3 text-slate-900 dark:text-white tracking-tight"
      >
        Remove
        <span
          class="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent"
          >AI Sparkle Watermark</span
        >
      </h1>
      <p
        class="text-slate-500 dark:text-slate-400 max-w-xl mx-auto font-medium text-base md:text-lg mb-6"
      >
        Remove the visible ✨ sparkle watermark from Gemini AI
        <strong>images</strong> and <strong>videos</strong>.
        <span class="text-brand-primary dark:text-brand-secondary font-semibold"
          >Free, fast, lossless &amp; private.</span
        >
      </p>

      <!-- Before / After showcase -->
      <BeforeAfter />

      <!-- Trust badges -->
      <div
        class="flex flex-wrap items-center justify-center gap-3 my-8 text-xs font-bold text-slate-500 dark:text-slate-400"
      >
        <span
          class="inline-flex items-center gap-1.5 bg-white dark:bg-theme-cardDark border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-full"
        >
          <iconify-icon icon="ph:lock-key-fill" width="14" class="text-blue-500" aria-hidden="true"></iconify-icon>
          100% Client-Side
        </span>
        <span
          class="inline-flex items-center gap-1.5 bg-white dark:bg-theme-cardDark border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-full"
        >
          <iconify-icon icon="ph:image-bold" width="14" class="text-brand-primary" aria-hidden="true"></iconify-icon>
          Images &amp; Videos
        </span>
        <span
          class="inline-flex items-center gap-1.5 bg-white dark:bg-theme-cardDark border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-full"
        >
          <iconify-icon icon="ph:sparkle-fill" width="14" class="text-purple-500" aria-hidden="true"></iconify-icon>
          Lossless Quality
        </span>
      </div>

      <!-- Tab switcher -->
      <div class="max-w-5xl mx-auto mb-5">
        <div
          class="inline-flex p-1.5 rounded-2xl bg-gray-100 dark:bg-theme-cardDark border border-gray-200 dark:border-gray-800"
          role="tablist"
          aria-label="Choose what to clean"
        >
          <button
            role="tab"
            :aria-selected="tab === 'image'"
            @click="tab = 'image'"
            :class="[
              'flex items-center gap-2 px-5 sm:px-7 py-2.5 rounded-xl font-bold text-sm transition-all',
              tab === 'image'
                ? 'bg-white dark:bg-gray-800 text-brand-primary shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            ]"
          >
            <iconify-icon icon="ph:image-bold" width="18"></iconify-icon> Image
          </button>
          <button
            role="tab"
            :aria-selected="tab === 'video'"
            @click="tab = 'video'"
            :class="[
              'flex items-center gap-2 px-5 sm:px-7 py-2.5 rounded-xl font-bold text-sm transition-all',
              tab === 'video'
                ? 'bg-white dark:bg-gray-800 text-brand-primary shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            ]"
          >
            <iconify-icon icon="ph:video-camera-bold" width="18"></iconify-icon> Video
            <span class="text-[10px] font-bold bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded-full">NEW</span>
          </button>
        </div>
      </div>

      <!-- Tool panels -->
      <ImageRemover v-show="tab === 'image'" />
      <VideoRemover v-show="tab === 'video'" />

      <!-- Key Info: 2-column -->
      <div class="max-w-3xl mx-auto mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
        <aside
          class="bg-amber-50/60 dark:bg-amber-900/10 border border-amber-200/60 dark:border-amber-900/30 rounded-2xl p-5"
        >
          <h3 class="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300 mb-2 text-sm">
            <iconify-icon icon="ph:warning-fill" class="text-lg" aria-hidden="true"></iconify-icon> Important Rule
          </h3>
          <p class="text-sm text-amber-700/80 dark:text-amber-300/70 font-medium mb-2">
            Use the <strong>actual downloaded file</strong> from Gemini:
          </p>
          <ul class="space-y-1 text-sm text-amber-700/70 dark:text-amber-300/60 font-medium">
            <li class="flex items-center gap-2"><span class="text-red-500">×</span> Don't right-click "Save As"</li>
            <li class="flex items-center gap-2"><span class="text-red-500">×</span> Don't use screenshots / re-records</li>
            <li class="flex items-center gap-2"><span class="text-emerald-600">✓</span> Use the <strong>Download</strong> button</li>
          </ul>
        </aside>
        <aside
          class="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/60 dark:border-blue-900/30 rounded-2xl p-5"
        >
          <h3 class="flex items-center gap-2 font-bold text-blue-800 dark:text-blue-300 mb-2 text-sm">
            <iconify-icon icon="ph:info-fill" class="text-lg" aria-hidden="true"></iconify-icon> About SynthID
          </h3>
          <p class="text-sm text-blue-700/80 dark:text-blue-300/70 font-medium">
            This tool removes only the <strong>visible sparkle logo</strong> for aesthetic purposes.
            It does <span class="underline">not</span> remove the invisible SynthID watermark that Google embeds for safety.
          </p>
        </aside>
      </div>

      <!-- Feature Cards: 3-column -->
      <div class="max-w-3xl mx-auto mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
        <article
          class="bg-white dark:bg-theme-cardDark p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-shadow"
        >
          <div
            class="w-10 h-10 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center mb-3 text-xl"
            aria-hidden="true"
          >
            <iconify-icon icon="ph:sparkle-fill"></iconify-icon>
          </div>
          <h3 class="font-bold text-slate-900 dark:text-white mb-1 text-sm">100% Lossless</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            Restores original pixels mathematically. No compression or artifacts on images.
          </p>
        </article>
        <article
          class="bg-white dark:bg-theme-cardDark p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-shadow"
        >
          <div
            class="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center mb-3 text-xl"
            aria-hidden="true"
          >
            <iconify-icon icon="ph:lock-key-fill"></iconify-icon>
          </div>
          <h3 class="font-bold text-slate-900 dark:text-white mb-1 text-sm">Privacy First</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            100% in-browser processing. Your photos &amp; videos never leave your device.
          </p>
        </article>
        <article
          class="bg-white dark:bg-theme-cardDark p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-shadow"
        >
          <div
            class="w-10 h-10 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center mb-3 text-xl"
            aria-hidden="true"
          >
            <iconify-icon icon="ph:code-bold"></iconify-icon>
          </div>
          <h3 class="font-bold text-slate-900 dark:text-white mb-1 text-sm">Open Source</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            Free forever. Inspect the code on
            <a
              href="https://github.com/dearabhin/gemini-watermark-remover"
              class="text-brand-primary hover:underline"
              rel="noopener noreferrer"
              >GitHub</a
            >.
          </p>
        </article>
      </div>
    </section>
  </main>

  <SiteFooter />
  <SupportPopup />
</template>
