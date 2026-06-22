// Raw-bytes imports (wrangler "Data" rule) and the project's plain-JS engine.
declare module "*.png" {
  const data: ArrayBuffer;
  export default data;
}
declare module "../../src/engine/blendModes.js" {
  export function removeWatermark(
    imageData: { width: number; height: number; data: Uint8Array | Uint8ClampedArray },
    alphaMap: Float32Array,
    position: { x: number; y: number; width: number; height: number },
    options?: { alphaGain?: number },
  ): void;
}
declare module "../../src/engine/alphaMap.js" {
  export function calculateAlphaMap(bg: {
    width: number;
    height: number;
    data: Uint8Array | Uint8ClampedArray;
  }): Float32Array;
}
declare module "../../src/engine/geometry.js" {
  export function getWatermarkInfo(
    width: number,
    height: number,
  ): { size: number; x: number; y: number; width: number; height: number };
}
