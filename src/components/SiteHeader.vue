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

      <div class="flex items-center gap-4">
        <button
          @click="toggleTheme"
          class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-slate-600 dark:text-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
          aria-label="Toggle Dark Mode"
        >
          <iconify-icon v-if="isDark" icon="ph:sun-bold" width="22"></iconify-icon>
          <iconify-icon v-else icon="ph:moon-bold" width="22"></iconify-icon>
        </button>
      </div>
    </div>
  </header>
</template>