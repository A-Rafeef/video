import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// The homepage tool is a Vue SPA built by Vite.
// All static SEO pages (about, contact, blog, …) live in /public and are
// copied verbatim to /dist, so they keep their own pre-built /css/output.css.
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // <iconify-icon> is a web component, not a Vue component.
          isCustomElement: (tag) => tag === 'iconify-icon',
        },
      },
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
