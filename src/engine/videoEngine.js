import { WatermarkEngine } from './watermarkEngine.js';
import { removeWatermark } from './blendModes.js';

/**
 * Client-side Gemini Veo video watermark remover.
 *
 * Pipeline (decode/encode via the `mediabunny` WebCodecs library, same as the
 * GargantuaX reference): the Veo watermark is a static, mostly-white overlay
 * pinned to the bottom-right corner of every frame. Because the underlying
 * pixels change over time but the watermark does not, the per-pixel MINIMUM
 * brightness across frames reveals the watermark's true alpha (a watermarked
 * pixel can never be darker than `alpha * 255`). We:
 *
 *   1. Pass 1 — decode all frames and build a self-calibrated alpha map of the
 *      corner watermark from the per-pixel min brightness.
 *   2. Pass 2 — decode again, run the exact same Reverse Alpha Blending removal
 *      used by the image tool over the corner, re-encode to H.264 MP4, and copy
 *      the original audio through untouched.
 *
 * Everything runs locally; nothing is uploaded.
 */
export class VideoWatermarkEngine {
    constructor(engine) {
        this.engine = engine; // a ready WatermarkEngine
        this._mb = null;
    }

    static async create() {
        const engine = await WatermarkEngine.create();
        return new VideoWatermarkEngine(engine);
    }

    static isSupported() {
        return (
            typeof VideoEncoder !== 'undefined' &&
            typeof VideoDecoder !== 'undefined'
        );
    }

    async _lib() {
        if (!this._mb) this._mb = await import('mediabunny');
        return this._mb;
    }

    /**
     * Veo watermark geometry (bottom-right corner). Mirrors the reference
     * catalog: size ≈ shortSide/15, margin ≈ shortSide/10.
     */
    getVeoWatermark(width, height) {
        const base = Math.min(width, height);
        let size = Math.round(base / 15);
        size = Math.max(24, Math.min(size, base));
        const margin = Math.round(base / 10);
        return {
            size,
            x: Math.max(0, width - margin - size),
            y: Math.max(0, height - margin - size),
            width: size,
            height: size,
        };
    }

    /**
     * Region of interest: the bottom-right corner, padded around the expected
     * watermark box so calibration still works if the geometry is slightly off.
     */
    getRoi(width, height, wm) {
        const padX = Math.round(wm.size * 0.6);
        const padY = Math.round(wm.size * 0.6);
        const rx = Math.max(0, wm.x - padX);
        const ry = Math.max(0, wm.y - padY);
        return { x: rx, y: ry, width: width - rx, height: height - ry };
    }

    /**
     * @param {File} file
     * @param {(p:{progress:number, phase?:string})=>void} [onProgress]
     */
    async process(file, onProgress = () => {}) {
        const mb = await this._lib();
        const {
            ALL_FORMATS,
            BlobSource,
            BufferTarget,
            CanvasSource,
            EncodedAudioPacketSource,
            EncodedPacketSink,
            Input,
            Mp4OutputFormat,
            Output,
            QUALITY_HIGH,
            VideoSampleSink,
            canEncodeVideo,
        } = mb;

        if (canEncodeVideo && !(await canEncodeVideo('avc'))) {
            throw new Error(
                'Your browser cannot encode H.264 video locally. Please try the latest Chrome or Edge on desktop.'
            );
        }

        const originalUrl = URL.createObjectURL(file);
        const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

        const videoTrack = await input.getPrimaryVideoTrack();
        if (!videoTrack) {
            input.dispose?.();
            URL.revokeObjectURL(originalUrl);
            throw new Error('No decodable video track was found in this file.');
        }

        const width = videoTrack.displayWidth ?? videoTrack.codedWidth;
        const height = videoTrack.displayHeight ?? videoTrack.codedHeight;
        const duration = await input.computeDuration().catch(() => 0);

        let frameRate = 30;
        try {
            const stats = await videoTrack.computePacketStats(120);
            if (stats?.averagePacketRate) frameRate = Math.round(stats.averagePacketRate);
        } catch { /* keep default */ }

        const wm = this.getVeoWatermark(width, height);
        const roi = this.getRoi(width, height, wm);
        const region = { x: 0, y: 0, width: roi.width, height: roi.height };

        const canvas =
            typeof OffscreenCanvas !== 'undefined'
                ? new OffscreenCanvas(width, height)
                : Object.assign(document.createElement('canvas'), { width, height });
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // ─── Pass 1: self-calibrate the watermark alpha map ────────────────
        const alphaMap = await this._calibrate(
            mb, videoTrack, ctx, width, height, roi, duration, onProgress
        );

        // ─── Output setup ──────────────────────────────────────────────────
        const target = new BufferTarget();
        const output = new Output({ format: new Mp4OutputFormat(), target });
        const videoSource = new CanvasSource(canvas, {
            codec: 'avc',
            bitrate: QUALITY_HIGH,
            keyFrameInterval: 2,
            sizeChangeBehavior: 'passThrough',
        });
        output.addVideoTrack(videoSource, { frameRate });

        // Audio passthrough (best-effort, no re-encode).
        let audioSource = null;
        let audioTrack = null;
        let audioDecoderConfig = null;
        try {
            audioTrack = await input.getPrimaryAudioTrack();
            if (audioTrack) {
                const audioCodec = await audioTrack.getCodec();
                audioDecoderConfig = await audioTrack.getDecoderConfig().catch(() => null);
                if (audioCodec && audioDecoderConfig) {
                    audioSource = new EncodedAudioPacketSource(audioCodec);
                    output.addAudioTrack(audioSource);
                }
            }
        } catch {
            audioSource = null;
        }

        await output.start();

        // ─── Pass 2: remove watermark per frame and encode ─────────────────
        const fallbackDur = frameRate > 0 ? 1 / frameRate : 1 / 30;
        const sink = new VideoSampleSink(videoTrack);
        let firstTimestamp = null;
        let lastTimestamp = -1;
        for await (const sample of sink.samples()) {
            if (firstTimestamp === null) firstTimestamp = sample.timestamp;

            let timestamp = sample.timestamp - firstTimestamp;
            if (!(timestamp >= 0)) timestamp = 0;
            if (timestamp <= lastTimestamp) timestamp = lastTimestamp + fallbackDur;
            const dur =
                Number.isFinite(sample.duration) && sample.duration > 0
                    ? sample.duration
                    : fallbackDur;
            lastTimestamp = timestamp;

            sample.draw(ctx, 0, 0, width, height);
            sample.close();

            const px = ctx.getImageData(roi.x, roi.y, roi.width, roi.height);
            removeWatermark(px, alphaMap, region);
            ctx.putImageData(px, roi.x, roi.y);

            await videoSource.add(timestamp, dur);
            if (duration) {
                onProgress({ phase: 'encoding', progress: 0.5 + Math.min(0.49, (timestamp / duration) * 0.5) });
            }
        }
        videoSource.close();

        // Copy audio packets through, aligned to the same time origin.
        if (audioSource) {
            try {
                const offset = firstTimestamp ?? 0;
                const aSink = new EncodedPacketSink(audioTrack);
                let isFirstAudio = true;
                let lastAudioTs = -1;
                for await (const packet of aSink.packets()) {
                    let newTs = packet.timestamp - offset;
                    if (newTs < 0) continue;
                    if (newTs <= lastAudioTs) newTs = lastAudioTs + 1e-6;
                    lastAudioTs = newTs;

                    let outPacket = packet;
                    if (newTs !== packet.timestamp && typeof packet.clone === 'function') {
                        outPacket = packet.clone({ timestamp: newTs });
                    }
                    await audioSource.add(
                        outPacket,
                        isFirstAudio && audioDecoderConfig ? { decoderConfig: audioDecoderConfig } : undefined
                    );
                    isFirstAudio = false;
                }
            } catch (e) {
                console.warn('Audio passthrough failed; exporting video only.', e);
            } finally {
                audioSource.close();
            }
        }

        await output.finalize();
        input.dispose?.();

        if (!target.buffer) {
            URL.revokeObjectURL(originalUrl);
            throw new Error('Video export produced no output.');
        }

        const blob = new Blob([target.buffer], { type: 'video/mp4' });
        onProgress({ phase: 'done', progress: 1 });

        return {
            blob,
            url: URL.createObjectURL(blob),
            originalUrl,
            ext: 'mp4',
            mime: 'video/mp4',
            width,
            height,
        };
    }

    /**
     * Pass 1: decode frames and estimate the watermark alpha map from the
     * per-pixel minimum brightness inside the ROI. Returns a Float32Array
     * (roi.width × roi.height) of alpha values in [0, 1].
     */
    async _calibrate(mb, videoTrack, ctx, width, height, roi, duration, onProgress) {
        const { VideoSampleSink } = mb;
        const count = roi.width * roi.height;
        const minMax = new Float32Array(count).fill(255);

        const MAX_SAMPLES = 480; // bound calibration time on long clips
        let sampled = 0;

        const sink = new VideoSampleSink(videoTrack);
        for await (const sample of sink.samples()) {
            sample.draw(ctx, 0, 0, width, height);
            sample.close();

            const data = ctx.getImageData(roi.x, roi.y, roi.width, roi.height).data;
            for (let i = 0; i < count; i++) {
                const o = i * 4;
                const m = Math.max(data[o], data[o + 1], data[o + 2]);
                if (m < minMax[i]) minMax[i] = m;
            }

            sampled++;
            if (duration && sample.timestamp) {
                onProgress({ phase: 'analyzing', progress: Math.min(0.49, (sample.timestamp / duration) * 0.5) });
            }
            if (sampled >= MAX_SAMPLES) break;
        }

        // Use the Gemini sparkle TEMPLATE for the watermark SHAPE — so only the
        // logo pixels are ever altered, never the surrounding background (no
        // black box, no corner shadow, no halo on any video). We only calibrate
        // its STRENGTH: a scalar gain estimated from the video's own brightness
        // floor over the logo core.
        const wmGeom = this.getVeoWatermark(width, height);
        const template = this._templateRoiAlpha(roi, wmGeom); // alpha shape, 0..1

        let tMax = 0;
        for (let i = 0; i < count; i++) if (template[i] > tMax) tMax = template[i];
        if (tMax <= 0) return template;

        // gain ≈ median over the logo core of  floorBrightness / (alpha * 255).
        // For a watermarked pixel whose underlying content goes dark in some
        // frame, the brightness floor ≈ gain * alpha * 255, so this recovers the
        // real opacity relative to the template.
        const coreCut = 0.5 * tMax;
        const cand = [];
        for (let i = 0; i < count; i++) {
            if (template[i] < coreCut) continue;
            const g = minMax[i] / (template[i] * 255);
            if (Number.isFinite(g) && g > 0) cand.push(g);
        }
        let gain = 1;
        if (cand.length) {
            cand.sort((a, b) => a - b);
            gain = cand[cand.length >> 1];
        }
        gain = Math.min(Math.max(gain, 0.5), 4); // sane clamp

        const MAX_ALPHA = 0.99;
        const alphaMap = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const a = template[i] * gain;
            alphaMap[i] = a > 0 ? Math.min(a, MAX_ALPHA) : 0;
        }
        return alphaMap;
    }

    /** Template fallback: scaled Gemini sparkle alpha placed within the ROI. */
    _templateRoiAlpha(roi, wm) {
        const count = roi.width * roi.height;
        const alphaMap = new Float32Array(count);
        const offX = wm.x - roi.x;
        const offY = wm.y - roi.y;

        const c = document.createElement('canvas');
        c.width = wm.size; c.height = wm.size;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.imageSmoothingEnabled = true;
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(this.engine.bg96, 0, 0, wm.size, wm.size);
        const data = cx.getImageData(0, 0, wm.size, wm.size).data;

        for (let row = 0; row < wm.size; row++) {
            for (let col = 0; col < wm.size; col++) {
                const ri = (offY + row) * roi.width + (offX + col);
                if (ri < 0 || ri >= count) continue;
                const o = (row * wm.size + col) * 4;
                alphaMap[ri] = Math.max(data[o], data[o + 1], data[o + 2]) / 255;
            }
        }
        return alphaMap;
    }
}
