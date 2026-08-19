<script setup>
import { ref, onMounted } from 'vue';

const isDark = ref(false);
const isMenuOpen = ref(false);

onMounted(() => {
  isDark.value = document.documentElement.classList.contains('dark');
});

function toggleTheme() {
  const html = document.documentElement;
  if (html.classList.contains('dark')) {
    html.classList.remove('dark');
    localStorage.theme = 'light';
    isDark.value = false;
  } else {
    html.classList.add('dark');
    localStorage.theme = 'dark';
    isDark.value = true;
  }
}

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value;
}
</script>

<template>
  <header
    class="sticky top-0 z-50 bg-white/80 dark:bg-theme-dark/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800"
  >
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 overflow-hidden no-underline">
        <img src="/assets/logo.svg" alt="Gemini Watermark Remover" width="40" height="40" class="w-10 h-10 select-none" />
        <p
          class="text-lg md:text-xl font-bold text-slate-900 dark:text-white whitespace-nowrap tracking-tight m-0"
        >
          Gemini Watermark <span class="text-brand-primary">Remover</span>
        </p>
      </a>

      <div class="hidden md:flex items-center gap-4">
        <button
          @click="toggleTheme"
          class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-slate-600 dark:text-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
          aria-label="Toggle Dark Mode"
        >
          <iconify-icon v-if="isDark" icon="ph:sun-bold" width="22"></iconify-icon>
          <iconify-icon v-else icon="ph:moon-bold" width="22"></iconify-icon>
        </button>

        <nav
          aria-label="Site navigation"
          class="flex-shrink-0 border-l border-gray-200 dark:border-gray-700 pl-4 flex items-center gap-3"
        >
          <a
            href="/donate/"
            class="text-slate-600 dark:text-slate-400 hover-upi transition-colors flex items-center gap-1 font-semibold text-sm md:text-base"
            aria-label="Donate via UPI"
            title="Donate via UPI"
          >
            <iconify-icon icon="ph:hand-heart-bold" width="24"></iconify-icon>
            <span>Donate via UPI</span>
          </a>
        </nav>
      </div>

      <button
        @click="toggleMenu"
        class="md:hidden p-2 rounded-md text-slate-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none"
        aria-label="Toggle Menu"
      >
        <iconify-icon v-if="isMenuOpen" icon="ph:x-bold" width="24"></iconify-icon>
        <iconify-icon v-else icon="ph:list-bold" width="24"></iconify-icon>
      </button>
    </div>

    <div
      v-if="isMenuOpen"
      class="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-theme-dark/95 backdrop-blur-md px-4 py-4 flex flex-col gap-4 shadow-lg absolute w-full left-0"
    >
      <button
        @click="toggleTheme"
        class="flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-slate-600 dark:text-slate-400 transition-all text-left w-full font-semibold"
      >
        <iconify-icon v-if="isDark" icon="ph:sun-bold" width="22"></iconify-icon>
        <iconify-icon v-else icon="ph:moon-bold" width="22"></iconify-icon>
        <span>{{ isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode' }}</span>
      </button>

      <a
        href="/donate/"
        class="flex items-center gap-3 p-2 rounded-md text-slate-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-semibold"
      >
        <iconify-icon icon="ph:hand-heart-bold" width="24"></iconify-icon>
        <span>Donate via UPI</span>
      </a>
    </div>
  </header>
</template>