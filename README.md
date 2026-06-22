# Gemini Watermark Remover

[![Live Demo](https://img.shields.io/badge/demo-removewatermark.dev-success?style=flat-square&logo=cloudflare&logoColor=white)](https://removewatermark.dev)
[![Stack](https://img.shields.io/badge/tech-Vue%20%7C%20Vite%20%7C%20Tailwind-3B82F6?style=flat-square)](https://github.com/dearabhin/gemini-watermark-remover)
[![License](https://img.shields.io/badge/license-MIT-orange?style=flat-square)](LICENSE)

A high-performance, **100% client-side** tool for removing the visible Gemini AI sparkle watermark from both **images and videos**. Built with **Vue 3 + Vite + Tailwind CSS**, it uses a mathematically precise **Reverse Alpha Blending** algorithm to restore pixels with zero quality loss.

**🔗 Live Website:** [removewatermark.dev](https://removewatermark.dev)

---

## ✨ Before &amp; After

<table>
  <tr>
    <th align="center">Before (watermarked)</th>
    <th align="center">After (cleaned)</th>
  </tr>
  <tr>
    <td align="center"><img src="public/assets/before.png" alt="Gemini AI image with the visible sparkle watermark" width="100%" /></td>
    <td align="center"><img src="public/assets/after.png" alt="Gemini AI image after the sparkle watermark was removed" width="100%" /></td>
  </tr>
</table>

> The live site also shows this as an interactive drag-to-compare slider.

---

## 🚀 Features

* **Images & Videos:** Remove the sparkle watermark from Gemini images *and* videos — all in the browser.
* **100% Client-Side Processing:** No servers involved. Files are processed locally for maximum privacy.
* **Lossless Image Restoration:** Uses exact mathematical inversion rather than AI inpainting, preserving original pixel quality.
* **Audio-Preserving Video Cleaning:** Videos are processed frame-by-frame and re-encoded with their original audio intact (via `MediaRecorder` + Web Audio).
* **Auto-Detection:** Automatically detects watermark size (48px or 96px) based on resolution.
* **Mobile Responsive:** Fully optimized UI for desktop and mobile devices.

---

## 🧠 How It Works (The Algorithm)

Gemini adds watermarks using a standard **Alpha Compositing** (blending) technique. This tool simply reverses that math.

### 1. The Watermark Formula
When Gemini generates an image, it applies the watermark logo using this formula:

$$Pixel_{final} = (\alpha \times Pixel_{logo}) + (1 - \alpha) \times Pixel_{original}$$

Where:
* `α` (Alpha): The transparency level of the watermark pixel (0.0 to 1.0).
* `Pixel_logo`: The color of the watermark (Pure White / 255).
* `Pixel_original`: The original color we want to recover.

### 2. The Solution (Reverse Engineering)
Since we know the `Pixel_final` (from your uploaded image), the `Pixel_logo` (White), and the `α` map (extracted from reference images), we can solve for `Pixel_original`:

$$Pixel_{original} = \frac{Pixel_{final} - (\alpha \times Pixel_{logo})}{1 - \alpha}$$

### 3. Alpha Map Extraction
The tool loads two reference "background" images (`bg_48.png` and `bg_96.png`) which contain the isolated watermark alpha values. It reads these values to construct a precise `Float32Array` map of transparency levels, allowing for pixel-perfect subtraction.

---

## 📂 Project Structure

The homepage tool is a **Vue 3 + Vite** app. All SEO/content pages (about, blog, etc.)
remain static HTML in `public/` and are copied verbatim into the build.

```text
gemini-watermark-remover/
├── index.html              # Vite entry — SEO <head> + Vue mount point
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.js             # Vue bootstrap
│   ├── App.vue             # Layout + image/video tab switcher
│   ├── style.css           # Tailwind directives + custom CSS
│   ├── components/
│   │   ├── SiteHeader.vue / SiteFooter.vue / NotificationBanner.vue
│   │   ├── BeforeAfter.vue     # Drag-to-compare showcase
│   │   ├── ImageRemover.vue    # Image tool (uses original engine)
│   │   ├── VideoRemover.vue    # NEW video tool
│   │   └── SupportPopup.vue
│   └── engine/
│       ├── alphaMap.js     # Transparency value calculation
│       ├── blendModes.js   # Reverse Alpha Blending math
│       ├── watermarkEngine.js  # Image engine (asset loading & processing)
│       └── videoEngine.js  # NEW per-frame video engine (+ audio)
└── public/                 # Copied as-is to /dist
    ├── about.html, contact.html, terms.html, privacy-policy.html
    ├── blog/ …
    ├── assets/             # bg_48.png, bg_96.png, before.png, after.png, og-image.jpg
    ├── fonts/, favicons, robots.txt, sitemap.xml, llms.txt, site.webmanifest
    └── css/output.css      # Tailwind build for the static pages (generated)
```


## 🛠️ Tech Stack

* **Vue 3** (Composition API, `<script setup>`)
* **Vite** for dev/build
* **Tailwind CSS** (via PostCSS)
* [Iconify](https://iconify.design/) for icons, JSZip (lazy-loaded) for bulk image download.

## ⚡ Running Locally

```bash
npm install

# Build the Tailwind CSS for the static SEO pages once (or `npm run watch:css`)
npm run build:css

# Start the Vite dev server for the homepage tool
npm run dev
```

## 📦 Build & Deploy (Cloudflare Pages)

```bash
npm run build      # builds css/output.css + Vite app into /dist
```


## ⚠️ Disclaimer

This tool is for **educational and personal use only**.
* It only removes visible watermarks; it **does not** remove invisible SynthID watermarks embedded by Google.
* Please respect Google's Terms of Service and Intellectual Property rights.

## 🤝 Credits

* Developed by **Abhin Krishna**.
* Image algorithm adapted from [GeminiWatermarkTool](https://github.com/allenk/GeminiWatermarkTool).
* Video watermark-removal pipeline follows [GargantuaX/gemini-watermark-remover](https://github.com/GargantuaX/gemini-watermark-remover) (MIT) — a WebCodecs decode → per-frame removal → MP4 re-encode flow with audio passthrough, powered by the [mediabunny](https://github.com/Vanilagy/mediabunny) library.