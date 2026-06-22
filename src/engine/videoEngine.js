import { WatermarkEngine } from './watermarkEngine.js';
import { removeWatermark } from './blendModes.js';

/**
 * Client-side video watermark remover.
 *
 * It reuses the *exact* same Reverse Alpha Blending logic as the image remover
 * (via WatermarkEngine), applied frame-by-frame:
 *   1. The video is played back (silently) into a hidden <video> element.
 *   2. Each presented frame is drawn to a canvas; the watermark region in the
 *      bottom-right corner is corrected in place.
 *   3. The processed canvas is captured with MediaRecorder, while the original
 *      audio is routed through the Web Audio graph so sound is preserved.
 *
 * Everything happens locally — no upload, no server.
 */
export class VideoWatermarkEngine {
    constructor(engine) {
        this.engine = engine; // a ready WatermarkEngine
    }

    static async create() {
        const engine = await WatermarkEngine.create();
        return new VideoWatermarkEngine(engine);
    }

    static isSupported() {
        return (
            typeof MediaRecorder !== 'undefined' &&
            !!document.createElement('canvas').captureStream
        );
    }

    /** Pick the best container/codec this browser can record. */
    static pickMimeType() {
        const candidates = [
            'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
        ];
        for (const type of candidates) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return '';
    }

    /**
     * @param {File} file
     * @param {(p:{phase:string, progress:number})=>void} [onProgress]
     */
    async process(file, onProgress = () => {}) {
        const objectUrl = URL.createObjectURL(file);

        const video = document.createElement('video');
        video.src = objectUrl;
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        video.preload = 'auto';

        // Load metadata to learn dimensions / duration.
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(new Error('Could not read this video file.'));
        });

        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
            URL.revokeObjectURL(objectUrl);
            throw new Error('This video has no decodable video track.');
        }
        const duration = isFinite(video.duration) ? video.duration : 0;

        // Cache the alpha map for this resolution so per-frame work is sync.
        const { config, alphaMap } = await this.engine.prepareForSize(width, height);
        const region = { x: 0, y: 0, width: config.width, height: config.height };

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // --- Build the recording stream (video frames + original audio) ---
        const canvasStream = canvas.captureStream();
        let audioCtx = null;
        try {
            if (this._hasAudio(video)) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === 'suspended') await audioCtx.resume();
                const source = audioCtx.createMediaElementSource(video);
                const dest = audioCtx.createMediaStreamDestination();
                // Route ONLY to the recording destination — not to speakers —
                // so processing stays silent for the user.
                source.connect(dest);
                dest.stream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
            }
        } catch {
            // Audio routing is best-effort; fall back to video-only output.
            audioCtx = null;
        }

        const mimeType = VideoWatermarkEngine.pickMimeType();
        const recorder = new MediaRecorder(
            canvasStream,
            mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined
        );
        const chunks = [];
        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size) chunks.push(e.data);
        };

        const drawFrame = () => {
            ctx.drawImage(video, 0, 0, width, height);
            // Only touch the small watermark rectangle — cheap per frame.
            const px = ctx.getImageData(config.x, config.y, config.width, config.height);
            removeWatermark(px, alphaMap, region);
            ctx.putImageData(px, config.x, config.y);
        };

        const done = new Promise((resolve, reject) => {
            recorder.onstop = () => {
                const type = (mimeType || 'video/webm').split(';')[0];
                resolve(new Blob(chunks, { type }));
            };
            recorder.onerror = (e) => reject(e.error || new Error('Recording failed.'));
        });

        // --- Drive playback frame by frame ---
        const useRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

        await new Promise((resolve, reject) => {
            let stopped = false;
            const finish = () => {
                if (stopped) return;
                stopped = true;
                try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
                resolve();
            };

            video.onended = finish;
            video.onerror = () => { if (!stopped) { stopped = true; reject(new Error('Playback error.')); } };

            const tick = () => {
                if (stopped) return;
                drawFrame();
                if (duration) {
                    onProgress({ phase: 'processing', progress: Math.min(1, video.currentTime / duration) });
                }
                if (useRVFC) {
                    video.requestVideoFrameCallback(tick);
                } else {
                    if (video.ended || video.paused) return finish();
                    requestAnimationFrame(tick);
                }
            };

            recorder.start();
            // First frame, then start playback + the frame loop.
            video.play().then(() => {
                drawFrame();
                if (useRVFC) video.requestVideoFrameCallback(tick);
                else requestAnimationFrame(tick);
            }).catch(reject);
        });

        const blob = await done;

        // Cleanup
        try { if (audioCtx) await audioCtx.close(); } catch {}

        const isMp4 = (mimeType || '').startsWith('video/mp4');
        return {
            blob,
            url: URL.createObjectURL(blob),
            originalUrl: objectUrl,
            ext: isMp4 ? 'mp4' : 'webm',
            mime: blob.type,
            width,
            height,
        };
    }

    _hasAudio(video) {
        // Best-effort audio detection across browsers.
        if (typeof video.mozHasAudio === 'boolean') return video.mozHasAudio;
        if (typeof video.webkitAudioDecodedByteCount === 'number') {
            return video.webkitAudioDecodedByteCount > 0;
        }
        if (video.audioTracks) return video.audioTracks.length > 0;
        return true; // assume yes; routing is wrapped in try/catch
    }
}
