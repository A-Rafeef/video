// Server-side watermark removal. Reuses the project's pure (DOM-free) engine
// math and swaps the browser Canvas decode/encode for the Photon WASM codec.
import { PhotonImage } from "@cf-wasm/photon";

import { removeWatermark } from "../../src/engine/blendModes.js";
import { calculateAlphaMap } from "../../src/engine/alphaMap.js";
import { getWatermarkInfo } from "../../src/engine/geometry.js";

import bg48Png from "../assets/bg_48.png";
import bg96Png from "../assets/bg_96.png";

type RGBA = { width: number; height: number; data: Uint8Array };

/** Decode encoded image bytes (PNG/JPEG/WebP) to raw RGBA. */
function decodeToRGBA(bytes: Uint8Array): RGBA {
  const img = PhotonImage.new_from_byteslice(bytes);
  try {
    return {
      width: img.get_width(),
      height: img.get_height(),
      data: img.get_raw_pixels(),
    };
  } finally {
    img.free();
  }
}

/** Encode raw RGBA back to PNG bytes. */
function encodePNG(rgba: RGBA): Uint8Array {
  const img = new PhotonImage(rgba.data, rgba.width, rgba.height);
  try {
    return img.get_bytes();
  } finally {
    img.free();
  }
}

// Alpha maps are derived once from the bundled reference PNGs and cached.
let alpha48: Float32Array | null = null;
let alpha96: Float32Array | null = null;

function ensureAlphaMaps() {
  if (alpha48 && alpha96) return;
  alpha48 = calculateAlphaMap(decodeToRGBA(new Uint8Array(bg48Png)));
  alpha96 = calculateAlphaMap(decodeToRGBA(new Uint8Array(bg96Png)));
}

export type RemovalResult = {
  png: Uint8Array;
  width: number;
  height: number;
  info: ReturnType<typeof getWatermarkInfo>;
  applied: boolean;
};

/**
 * Remove the visible Gemini sparkle watermark from encoded image bytes.
 * Returns cleaned PNG bytes. `applied` is false when the image is too small
 * for the watermark box to fit (the original is returned re-encoded).
 */
export function removeGeminiWatermark(bytes: Uint8Array): RemovalResult {
  ensureAlphaMaps();

  const rgba = decodeToRGBA(bytes);
  const info = getWatermarkInfo(rgba.width, rgba.height);

  const fits =
    info.x >= 0 &&
    info.y >= 0 &&
    info.x + info.width <= rgba.width &&
    info.y + info.height <= rgba.height;

  let applied = false;
  if (fits) {
    const alphaMap = info.size === 96 ? alpha96! : alpha48!;
    removeWatermark(rgba, alphaMap, info);
    applied = true;
  }

  return { png: encodePNG(rgba), width: rgba.width, height: rgba.height, info, applied };
}
