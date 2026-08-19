import { WatermarkEngine } from './watermarkEngine.js';
import { removeWatermark } from './blendModes.js';
import { resolveBox, getRoi, buildAlpha, cleanFrame } from './tuner.js';

// Defaults that, in practice, make the Veo watermark effectively invisible.
export const VIDEO_DEFAULTS = { gain: 0.6, offsetX: -24, offsetY: -24, sizeScale: 1 };

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

    /** The Gemini sparkle reference image, for the tuner preview. */
    get sparkleImage() {
        return this.engine.bg96;
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

    /**
     * Clean a single full-frame ImageData in place (used for the live preview).
     * Returns the resolved watermark box + ROI so the UI can draw guides.
     */
    previewClean(fullImageData, width, height, opts = {}) {
        const base = this.getVeoWatermark(width, height);
        return cleanFrame(this.engine.bg96, fullImageData, width, height, base, {
            ...opts,
            gain: opts.gain ?? VIDEO_DEFAULTS.gain,
        });
    }

    /**
     * @param {File} file
     * @param {{gain?:number, offsetX?:number, offsetY?:number, sizeScale?:number,
     *          onProgress?:(p:{progress:number})=>void}} [opts]
     */
    async process(file, opts = {}) {
        const onProgress = opts.onProgress || (() => {});
        const gain = opts.gain ?? VIDEO_DEFAULTS.gain;

        const mb = await this._lib();
        const {
            ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input,
            Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeVideo,
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

        const base = this.getVeoWatermark(width, height);
        const wm = resolveBox(base, width, height, opts);
        const roi = getRoi(width, height, wm);
        const alpha = buildAlpha(this.engine.bg96, roi, wm, gain);
        const region = { x: 0, y: 0, width: roi.width, height: roi.height };

        const canvas =
            typeof OffscreenCanvas !== 'undefined'
                ? new OffscreenCanvas(width, height)
                : Object.assign(document.createElement('canvas'), { width, height });
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const target = new BufferTarget();
        const output = new Output({ format: new Mp4OutputFormat(), target });

        const conversion = await Conversion.init({
            input,
            output,
            video: {
                codec: 'avc',
                bitrate: QUALITY_HIGH,
                process: (sample) => {
                    sample.draw(ctx, 0, 0, width, height);
                    const px = ctx.getImageData(roi.x, roi.y, roi.width, roi.height);
                    removeWatermark(px, alpha, region);
                    ctx.putImageData(px, roi.x, roi.y);
                    return canvas;
                },
            },
        });

        conversion.onProgress = (p) => {
            onProgress({ progress: p });
        };

        await conversion.execute();
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

    /**
     * Combine multiple video files into a single merged MP4 with watermarks removed
     * and optional transitions between clips. Preserves audio when present.
     *
     * @param {File[]} files
     * @param {{gain?:number, offsetX?:number, offsetY?:number, sizeScale?:number,
     *          transition?:'cut'|'fade'|'crossfade', transitionDuration?:number,
     *          onProgress?:(p:{progress:number, currentFileIndex:number, totalFiles:number})=>void}} [opts]
     */
    async combineProcess(files, opts = {}) {
        if (!files || files.length === 0) {
            throw new Error('No files provided to combine.');
        }

        const onProgress = opts.onProgress || (() => {});
        const gain = opts.gain ?? VIDEO_DEFAULTS.gain;
        const transition = opts.transition || 'cut';
        const transDur = opts.transitionDuration ?? 0.5;

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

        // 1. Inspect first video to determine output dimensions and frame rate
        const firstInput = new Input({ source: new BlobSource(files[0]), formats: ALL_FORMATS });
        const firstTrack = await firstInput.getPrimaryVideoTrack();
        if (!firstTrack) {
            firstInput.dispose?.();
            throw new Error(`No decodable video track found in ${files[0].name}`);
        }

        const width = firstTrack.displayWidth ?? firstTrack.codedWidth;
        const height = firstTrack.displayHeight ?? firstTrack.codedHeight;

        let frameRate = 30;
        try {
            const stats = await firstTrack.computePacketStats(120);
            if (stats?.averagePacketRate) frameRate = Math.round(stats.averagePacketRate);
        } catch { /* keep default */ }
        firstInput.dispose?.();

        const base = this.getVeoWatermark(width, height);
        const wm = resolveBox(base, width, height, opts);
        const roi = getRoi(width, height, wm);
        const alpha = buildAlpha(this.engine.bg96, roi, wm, gain);
        const region = { x: 0, y: 0, width: roi.width, height: roi.height };

        const canvas =
            typeof OffscreenCanvas !== 'undefined'
                ? new OffscreenCanvas(width, height)
                : Object.assign(document.createElement('canvas'), { width, height });
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Buffer canvas for saving last frame of previous clip (for crossfade)
        const lastFrameCanvas = document.createElement('canvas');
        lastFrameCanvas.width = width;
        lastFrameCanvas.height = height;
        const lastFrameCtx = lastFrameCanvas.getContext('2d', { willReadFrequently: true });
        let hasLastFrame = false;

        const target = new BufferTarget();
        const output = new Output({ format: new Mp4OutputFormat(), target });
        const videoSource = new CanvasSource(canvas, {
            codec: 'avc',
            bitrate: QUALITY_HIGH,
            keyFrameInterval: 2,
            sizeChangeBehavior: 'passThrough',
        });
        output.addVideoTrack(videoSource, { frameRate });

        // Setup Audio Track for Combine Mode (if input clips have audio)
        let audioSource = null;
        let globalLastAudioTs = -1;
        try {
            const firstAudioInput = new Input({ source: new BlobSource(files[0]), formats: ALL_FORMATS });
            const firstAudioTrack = await firstAudioInput.getPrimaryAudioTrack();
            if (firstAudioTrack) {
                const aCodec = await firstAudioTrack.getCodec();
                if (aCodec) {
                    audioSource = new EncodedAudioPacketSource(aCodec);
                    output.addAudioTrack(audioSource);
                }
            }
            firstAudioInput.dispose?.();
        } catch {
            audioSource = null;
        }

        await output.start();

        const fallbackDur = frameRate > 0 ? 1 / frameRate : 1 / 30;
        let globalTimestamp = 0;
        let globalLastTimestamp = -1;

        const totalFiles = files.length;

        for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
            const file = files[fileIdx];
            const isFirstFile = fileIdx === 0;
            const isLastFile = fileIdx === totalFiles - 1;

            const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
            const videoTrack = await input.getPrimaryVideoTrack();
            if (!videoTrack) {
                input.dispose?.();
                continue;
            }

            const duration = await input.computeDuration().catch(() => 0);
            const sink = new VideoSampleSink(videoTrack);
            let firstTimestampInClip = null;
            let clipLastTimestamp = -1;

            for await (const sample of sink.samples()) {
                if (firstTimestampInClip === null) firstTimestampInClip = sample.timestamp;
                let relTs = sample.timestamp - firstTimestampInClip;
                if (!(relTs >= 0)) relTs = 0;

                const sampleDur =
                    Number.isFinite(sample.duration) && sample.duration > 0
                        ? sample.duration
                        : fallbackDur;

                let timestamp = globalTimestamp + relTs;
                if (timestamp <= globalLastTimestamp) {
                    timestamp = globalLastTimestamp + fallbackDur;
                }
                globalLastTimestamp = timestamp;

                // Draw frame and remove watermark
                sample.draw(ctx, 0, 0, width, height);
                sample.close();

                const px = ctx.getImageData(roi.x, roi.y, roi.width, roi.height);
                removeWatermark(px, alpha, region);
                ctx.putImageData(px, roi.x, roi.y);

                // Apply Transitions
                if (!isFirstFile && relTs < transDur) {
                    const factor = relTs / transDur; // 0 to 1
                    if (transition === 'fade') {
                        // Fade in from black
                        ctx.fillStyle = `rgba(0, 0, 0, ${1 - factor})`;
                        ctx.fillRect(0, 0, width, height);
                    } else if (transition === 'crossfade' && hasLastFrame) {
                        // Cross-dissolve: blend previous clip's last frame over current frame
                        ctx.globalAlpha = 1 - factor;
                        ctx.drawImage(lastFrameCanvas, 0, 0, width, height);
                        ctx.globalAlpha = 1.0;
                    }
                }

                if (!isLastFile && duration > 0 && relTs > (duration - transDur)) {
                    const remaining = duration - relTs;
                    const factor = Math.max(0, Math.min(1, remaining / transDur)); // 1 down to 0
                    if (transition === 'fade') {
                        // Fade out to black
                        ctx.fillStyle = `rgba(0, 0, 0, ${1 - factor})`;
                        ctx.fillRect(0, 0, width, height);
                    }
                }

                // Save current frame as last frame if near end of clip (for crossfade)
                if (!isLastFile && duration > 0 && relTs >= (duration - fallbackDur * 2)) {
                    lastFrameCtx.drawImage(canvas, 0, 0, width, height);
                    hasLastFrame = true;
                }

                await videoSource.add(timestamp, sampleDur);
                clipLastTimestamp = relTs;

                // Progress update
                const overallRatio = (fileIdx + (duration ? Math.min(1, relTs / duration) : 0)) / totalFiles;
                onProgress({ progress: Math.min(0.99, overallRatio), currentFileIndex: fileIdx, totalFiles });
            }

            // Process Audio Track for current clip if audio is supported
            if (audioSource) {
                try {
                    const audioTrack = await input.getPrimaryAudioTrack().catch(() => null);
                    if (audioTrack) {
                        const aSink = new EncodedPacketSink(audioTrack);
                        const decoderConfig = await audioTrack.getDecoderConfig().catch(() => null);
                        let isFirstAudio = true;
                        for await (const packet of aSink.packets()) {
                            let relAudioTs = packet.timestamp - (firstTimestampInClip || 0);
                            if (relAudioTs < 0) relAudioTs = 0;
                            let ts = globalTimestamp + relAudioTs;
                            if (ts <= globalLastAudioTs) {
                                ts = globalLastAudioTs + 1e-5;
                            }
                            globalLastAudioTs = ts;
                            const outPacket = packet.clone({ timestamp: ts });
                            await audioSource.add(outPacket, isFirstAudio && decoderConfig ? { decoderConfig } : undefined);
                            isFirstAudio = false;
                        }
                    }
                } catch (e) {
                    console.warn('Audio passthrough for clip failed:', fileIdx, e);
                }
            }

            if (clipLastTimestamp > 0) {
                globalTimestamp += clipLastTimestamp + fallbackDur;
            } else {
                globalTimestamp += duration || 1;
            }

            input.dispose?.();
        }

        videoSource.close();
        if (audioSource) audioSource.close();

        await output.finalize();

        if (!target.buffer) {
            throw new Error('Video combine produced no output.');
        }

        const blob = new Blob([target.buffer], { type: 'video/mp4' });
        onProgress({ progress: 1, currentFileIndex: totalFiles - 1, totalFiles });

        return {
            blob,
            url: URL.createObjectURL(blob),
            ext: 'mp4',
            mime: 'video/mp4',
            width,
            height,
        };
    }
}

