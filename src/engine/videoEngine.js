import { WatermarkEngine } from './watermarkEngine.js';
import { removeWatermark } from './blendModes.js';

/**
 * Client-side Gemini Veo video watermark remover.
 *
 * Decoding/encoding is done with the `mediabunny` WebCodecs library. Removal
 * is confined to the Gemini sparkle TEMPLATE shape (so only the logo pixels are
 * ever altered — never the background), and the user controls the strength,
 * position and size of that template via a live preview before exporting.
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

    /** Default Veo watermark box (bottom-right): size ≈ shortSide/15, margin ≈ shortSide/10. */
    getVeoWatermark(width, height) {
        const base = Math.min(width, height);
        const size = Math.max(24, Math.min(Math.round(base / 15), base));
        const margin = Math.round(base / 10);
        return {
            size,
            x: Math.max(0, width - margin - size),
            y: Math.max(0, height - margin - size),
            width: size,
            height: size,
        };
    }

    /** Apply the user's manual offset/size tweaks to the default box. */
    resolveBox(width, height, opts = {}) {
        const base = this.getVeoWatermark(width, height);
        const sizeScale = opts.sizeScale || 1;
        const size = Math.max(8, Math.min(Math.round(base.size * sizeScale), Math.min(width, height)));
        const x = Math.max(0, Math.min(base.x + Math.round(opts.offsetX || 0), width - size));
        const y = Math.max(0, Math.min(base.y + Math.round(opts.offsetY || 0), height - size));
        return { size, x, y, width: size, height: size };
    }

    /** Padded region of interest that always contains the watermark box. */
    getRoi(width, height, wm) {
        const pad = Math.round(wm.size * 0.6);
        const rx = Math.max(0, wm.x - pad);
        const ry = Math.max(0, wm.y - pad);
        const rw = Math.min(width - rx, wm.width + pad * 2);
        const rh = Math.min(height - ry, wm.height + pad * 2);
        return { x: rx, y: ry, width: rw, height: rh };
    }

    /** Scaled Gemini sparkle alpha (template shape) placed inside the ROI, scaled by gain. */
    buildAlpha(roi, wm, gain) {
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
                const a = (Math.max(data[o], data[o + 1], data[o + 2]) / 255) * gain;
                alphaMap[ri] = a > 0 ? Math.min(a, 0.99) : 0;
            }
        }
        return alphaMap;
    }

    /**
     * Clean a single full-frame ImageData in place (used for the live preview).
     * Returns the resolved watermark box + ROI so the UI can draw guides.
     */
    previewClean(fullImageData, width, height, opts = {}) {
        const wm = this.resolveBox(width, height, opts);
        const roi = this.getRoi(width, height, wm);
        const alpha = this.buildAlpha(roi, wm, opts.gain ?? 1.5);
        removeWatermark(fullImageData, alpha, {
            x: roi.x, y: roi.y, width: roi.width, height: roi.height,
        });
        return { wm, roi };
    }

    /**
     * @param {File} file
     * @param {{gain?:number, offsetX?:number, offsetY?:number, sizeScale?:number,
     *          onProgress?:(p:{progress:number})=>void}} [opts]
     */
    async process(file, opts = {}) {
        const onProgress = opts.onProgress || (() => {});
        const gain = opts.gain ?? 1.5;

        const mb = await this._lib();
        const {
            ALL_FORMATS, BlobSource, BufferTarget, CanvasSource,
            EncodedAudioPacketSource, EncodedPacketSink, Input,
            Mp4OutputFormat, Output, QUALITY_HIGH, VideoSampleSink, canEncodeVideo,
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

        const wm = this.resolveBox(width, height, opts);
        const roi = this.getRoi(width, height, wm);
        const alpha = this.buildAlpha(roi, wm, gain);
        const region = { x: 0, y: 0, width: roi.width, height: roi.height };

        const canvas =
            typeof OffscreenCanvas !== 'undefined'
                ? new OffscreenCanvas(width, height)
                : Object.assign(document.createElement('canvas'), { width, height });
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const target = new BufferTarget();
        const output = new Output({ format: new Mp4OutputFormat(), target });
        const videoSource = new CanvasSource(canvas, {
            codec: 'avc',
            bitrate: QUALITY_HIGH,
            keyFrameInterval: 2,
            sizeChangeBehavior: 'passThrough',
        });
        output.addVideoTrack(videoSource, { frameRate });

        // Audio passthrough (best-effort).
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
            removeWatermark(px, alpha, region);
            ctx.putImageData(px, roi.x, roi.y);

            await videoSource.add(timestamp, dur);
            if (duration) onProgress({ progress: Math.min(0.99, timestamp / duration) });
        }
        videoSource.close();

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
        onProgress({ progress: 1 });

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
}
