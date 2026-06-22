import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { removeGeminiWatermark } from "./removal";
import { getWatermarkInfo } from "../../src/engine/geometry.js";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB input cap
const FETCH_TIMEOUT_MS = 10_000;

interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

// ── helpers ───────────────────────────────────────────────────────
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function fetchImageBytes(url: string): Promise<Uint8Array> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("image_url is not a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("image_url must be an http(s) URL.");
  }
  const res = await fetch(parsed, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Failed to fetch image_url (HTTP ${res.status}).`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("Fetched image exceeds the 15 MB limit.");
  return buf;
}

async function resolveInput(args: { image_base64?: string; image_url?: string }): Promise<Uint8Array> {
  const hasB64 = !!args.image_base64;
  const hasUrl = !!args.image_url;
  if (hasB64 === hasUrl) {
    throw new Error("Provide exactly one of image_base64 or image_url.");
  }
  if (hasB64) {
    const bytes = base64ToBytes(args.image_base64!);
    if (bytes.byteLength > MAX_BYTES) throw new Error("Image exceeds the 15 MB limit.");
    return bytes;
  }
  return fetchImageBytes(args.image_url!);
}

// ── MCP agent ─────────────────────────────────────────────────────
export class WatermarkMCP extends McpAgent {
  server = new McpServer({
    name: "gemini-watermark-remover",
    version: "1.0.0",
  });

  async init() {
    this.server.tool(
      "remove_gemini_image_watermark",
      "Remove the visible Google Gemini AI sparkle watermark from the bottom-right corner of an image using lossless Reverse Alpha Blending. Provide EXACTLY ONE of image_base64 or image_url. Returns a cleaned PNG. Note: this removes only the visible logo, NOT the invisible SynthID watermark. Video is not supported.",
      {
        image_base64: z
          .string()
          .optional()
          .describe("Base64-encoded image bytes (PNG, JPEG or WebP). Data-URL prefix is allowed."),
        image_url: z
          .string()
          .url()
          .optional()
          .describe("Public http(s) URL of the image to clean."),
      },
      async (args) => {
        try {
          const bytes = await resolveInput(args);
          const { png, width, height, info, applied } = removeGeminiWatermark(bytes);
          const note = applied
            ? `Cleaned ${width}×${height} image — removed the ${info.size}px sparkle watermark at (${info.x}, ${info.y}). The invisible SynthID watermark is NOT removed.`
            : `Image is ${width}×${height}; too small for a watermark box to fit, so it was returned unchanged.`;
          return {
            content: [
              { type: "image", data: bytesToBase64(png), mimeType: "image/png" },
              { type: "text", text: note },
            ],
          };
        } catch (e: any) {
          return { isError: true, content: [{ type: "text", text: `Error: ${e?.message ?? e}` }] };
        }
      },
    );

    this.server.tool(
      "get_watermark_info",
      "Return the detected Gemini watermark box (size, x, y) for the given image dimensions, without processing an image.",
      {
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      },
      async ({ width, height }) => ({
        content: [{ type: "text", text: JSON.stringify(getWatermarkInfo(width, height)) }],
      }),
    );
  }
}

// ── Worker entry: rate limit + route to MCP transports ────────────
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (env.RATE_LIMITER) {
      const ip = request.headers.get("cf-connecting-ip") ?? "anonymous";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response("Rate limit exceeded. Try again shortly.", { status: 429 });
      }
    }

    if (url.pathname === "/mcp") {
      return WatermarkMCP.serve("/mcp").fetch(request, env, ctx);
    }
    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return WatermarkMCP.serveSSE("/sse").fetch(request, env, ctx);
    }
    if (url.pathname === "/") {
      return new Response(
        "Gemini Watermark Remover — MCP server. Connect an MCP client to /mcp (Streamable HTTP) or /sse (legacy).",
        { headers: { "content-type": "text/plain" } },
      );
    }
    return new Response("Not found", { status: 404 });
  },
};
