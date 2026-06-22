import { WatermarkEngine } from './watermarkEngine.js';
import { removeWatermark } from './blendModes.js';

/**
 * Client-side Gemini Veo video watermark remover.
 *
 * Approach: decode the video with WebCodecs via the `mediabunny` library,
 * run the exact same Reverse Alpha Blending removal used by the image tool
 * on the bottom-right watermark of every frame, then re-encode to H.264 MP4.
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
     * @param {File} file
     * @param {(p:{progress:number})=>void} [onProgress]
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

        // FIX: Use the exact same pristine alpha map and fixed size (48 or 96) as the Image Remover.
        // Scaling the alpha map caused interpolation artifacts resulting in a darkened/shadowed box.
        const prepared = await this.engine.prepareForSize(width, height);
        const { config, alphaMap } = prepared;
        const region = { x: 0, y: 0, width: config.width, height: config.height };

        const canvas =
            typeof OffscreenCanvas !== 'undefined'
                ? new OffscreenCanvas(width, height)
                : Object.assign(document.createElement('canvas'), { width, height });
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // --- Output setup ---
        const target = new BufferTarget();
        const output = new Output({ format: new Mp4OutputFormat(), target });
        const videoSource = new CanvasSource(canvas, {
            codec: 'avc',
            bitrate: QUALITY_HIGH,
        });
        output.addVideoTrack(videoSource, { frameRate });

        // --- Audio passthrough (best-effort, no re-encode) ---
        let audioSource = null;
        let audioTrack = null;
        let audioDecoderConfig = null;
        try {
            audioTrack = await input.getPrimaryAudioTrack();
            if (audioTrack) {
                const audioCodec = await audioTrack.getCodec();
                audioDecoderConfig = await audioTrack.getDecoderConfig().catch(() => null);
                // Only carry audio if we have a codec AND a decoder config
                if (audioCodec && audioDecoderConfig) {
                    audioSource = new EncodedAudioPacketSource(audioCodec);
                    output.addAudioTrack(audioSource);
                }
            }
        } catch {
            audioSource = null;
        }

        await output.start();

        // --- Process every video frame ---
        const fallbackDur = frameRate > 0 ? Math.round(1e6 / frameRate) : Math.round(1e6 / 30);
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

            // Reverse Alpha Blending on just the corner watermark rectangle.
            // Reading only the small patch is mathematically identical to processing the full frame, but much faster.
            const px = ctx.getImageData(config.x, config.y, config.width, config.height);
            removeWatermark(px, alphaMap, region);
            ctx.putImageData(px, config.x, config.y);

            await videoSource.add(timestamp, dur);
            if (duration) onProgress({ progress: Math.min(0.99, timestamp / duration) });
        }
        videoSource.close();

        // --- Copy audio packets through (aligned to the same time origin) ---
        if (audioSource) {
            try {
                const offset = firstTimestamp ?? 0;
                const aSink = new EncodedPacketSink(audioTrack);
                let isFirstAudio = true;
                let lastAudioTs = -1;
                
                for await (const packet of aSink.packets()) {
                    let newTs = packet.timestamp - offset;
                    if (newTs < 0) continue;
                    
                    // Ensure strictly increasing audio timestamps
                    if (newTs <= lastAudioTs) newTs = lastAudioTs + 1;
                    lastAudioTs = newTs;

                    let outPacket = packet;
                    if (newTs !== packet.timestamp) {
                        if (typeof packet.clone === 'function') {
                            outPacket = packet.clone({ timestamp: newTs });
                        } else if (typeof EncodedAudioChunk !== 'undefined' && packet instanceof EncodedAudioChunk) {
                            const buffer = new ArrayBuffer(packet.byteLength);
                            packet.copyTo(buffer);
                            outPacket = new EncodedAudioChunk({
                                type: packet.type,
                                timestamp: newTs,
                                duration: packet.duration,
                                data: buffer
                            });
                        }
                    }
                    
                    await audioSource.add(outPacket, isFirstAudio && audioDecoderConfig ? {
                        decoderConfig: audioDecoderConfig
                    } : undefined);
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