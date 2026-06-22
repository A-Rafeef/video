import { calculateAlphaMap } from './alphaMap.js';
import { removeWatermark } from './blendModes.js';
import { getWatermarkInfo } from './geometry.js';

export class WatermarkEngine {
    constructor(bg48, bg96) {
        this.bg48 = bg48;
        this.bg96 = bg96;
        this.alphaMaps = {};
    }

    static async create() {
        const loadImage = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });

        try {
            const [bg48, bg96] = await Promise.all([
                loadImage('/assets/bg_48.png'),
                loadImage('/assets/bg_96.png')
            ]);
            return new WatermarkEngine(bg48, bg96);
        } catch (e) {
            console.error("Failed to load assets.");
            throw e;
        }
    }

    getWatermarkInfo(width, height) {
        return getWatermarkInfo(width, height);
    }

    async getAlphaMap(size) {
        if (this.alphaMaps[size]) return this.alphaMaps[size];

        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(size === 48 ? this.bg48 : this.bg96, 0, 0);

        const map = calculateAlphaMap(ctx.getImageData(0, 0, size, size));
        this.alphaMaps[size] = map;
        return map;
    }

    // Build a watermark alpha map at an arbitrary size by scaling the 96px
    // sparkle reference. Used for video frames, whose watermark size varies
    // with resolution. Cached per size.
    buildScaledAlphaMap(size) {
        if (this.alphaMaps[size]) return this.alphaMaps[size];

        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.bg96, 0, 0, size, size);

        const map = calculateAlphaMap(ctx.getImageData(0, 0, size, size));
        this.alphaMaps[size] = map;
        return map;
    }

    async process(imageFile) {
        // Create URL for processing and UI preview
        const objectUrl = URL.createObjectURL(imageFile);
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i); 
            i.onerror = reject;
            i.src = objectUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const config = this.getWatermarkInfo(canvas.width, canvas.height);
        
        const alphaMap = await this.getAlphaMap(config.size);
        removeWatermark(imageData, alphaMap, config);
        
        ctx.putImageData(imageData, 0, 0);
        
        return {
            blob: await new Promise(r => canvas.toBlob(r, 'image/png')),
            originalSrc: objectUrl, // Passed to app.js to fix the original image preview
            width: img.width,
            height: img.height
        };
    }

    // Pre-load the alpha map needed for a given frame size so per-frame
    // processing (e.g. video) stays fully synchronous and fast.
    async prepareForSize(width, height) {
        const config = this.getWatermarkInfo(width, height);
        const alphaMap = await this.getAlphaMap(config.size);
        return { config, alphaMap };
    }

    // Remove the watermark from an already-decoded frame (ImageData), in place.
    // Reuses the exact same Reverse Alpha Blending logic as the image remover.
    removeFromImageData(imageData, prepared) {
        const { config, alphaMap } =
            prepared || this._sync(imageData.width, imageData.height);
        removeWatermark(imageData, alphaMap, config);
        return imageData;
    }

    // Synchronous lookup used only after prepareForSize() has cached the map.
    _sync(width, height) {
        const config = this.getWatermarkInfo(width, height);
        return { config, alphaMap: this.alphaMaps[config.size] };
    }
}