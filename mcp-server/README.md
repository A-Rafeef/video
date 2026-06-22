# Gemini Watermark Remover — MCP Server

A remote [Model Context Protocol](https://modelcontextprotocol.io) server,
running on **Cloudflare Workers**, that removes the visible Google Gemini AI
sparkle watermark from images. It reuses this repo's lossless **Reverse Alpha
Blending** engine (`src/engine/`) and swaps the browser Canvas for the
[`@cf-wasm/photon`](https://github.com/fineshopdesign/cf-wasm) WASM image codec.

> **Images only.** Video is not supported — Cloudflare Workers have no WebCodecs,
> so the `mediabunny` video pipeline used on the website can't run server-side.

## Tools

| Tool | Input | Output |
| --- | --- | --- |
| `remove_gemini_image_watermark` | exactly one of `image_base64` or `image_url` | cleaned PNG (image content) + a note |
| `get_watermark_info` | `width`, `height` | detected watermark box JSON |

The tool removes only the **visible** logo. It does **not** remove Google's
invisible SynthID watermark.

## Develop

```bash
cd mcp-server
npm install
npm run dev          # wrangler dev → http://localhost:8787
```

Test with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
# Connect (Streamable HTTP) to http://localhost:8787/mcp
```

Then call `remove_gemini_image_watermark` with a base64 Gemini image or an
`image_url`, and confirm the returned PNG has the sparkle removed.

## Deploy

```bash
npm run deploy       # wrangler deploy
# → https://gemini-watermark-remover-mcp.<account>.workers.dev/mcp
```

This is a **separate Worker** from the Cloudflare Pages site — it does not affect
the website deployment.

### Connect from Claude Desktop

```json
{
  "mcpServers": {
    "gemini-watermark-remover": {
      "command": "npx",
      "args": ["mcp-remote", "https://gemini-watermark-remover-mcp.<account>.workers.dev/mcp"]
    }
  }
}
```

Or add the `/mcp` URL as a custom connector in Claude.ai.

## Notes

- **Authless**, with per-IP rate limiting (30 requests / 60s) via the Workers
  Rate Limiting binding in `wrangler.jsonc`.
- Max input size 15 MB; `image_url` must be `http(s)` and is fetched with a 10s timeout.
- If `@cf-wasm/photon` fails to load the WASM in your environment, import from
  `@cf-wasm/photon/workerd` instead.
- Inherits the website's current limitation: if Google shifts the watermark
  position, the fixed bottom-right geometry may need updating in
  `src/engine/geometry.js`.
