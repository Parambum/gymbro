import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["three"],
  // multiple lockfiles exist up-tree; pin tracing to this project
  outputFileTracingRoot: process.cwd(),
  // The coach reads these from disk at runtime, so tracing has to ship them:
  // the prompt, the research library, the embedding model, and onnxruntime's
  // Node build + WASM (imported by computed path, which the tracer cannot see).
  outputFileTracingIncludes: {
    "/api/coach": [
      "./shared/coach/system-prompt.md",
      "./src/lib/data/coach-kb.json",
      "./src/lib/data/coach-kb.bin",
      "./models/coach/bge-small-en-v1.5/model_quantized.onnx",
      "./models/coach/bge-small-en-v1.5/vocab.txt",
      "./node_modules/onnxruntime-web/package.json",
      "./node_modules/onnxruntime-web/dist/ort.node.min.mjs",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
    ],
  },

  /**
   * Security headers.
   *
   * These are the ones that can be turned on without knowing anything about
   * the page they protect. A full Content-Security-Policy is deliberately not
   * here: the app loads next/font, GSAP, three.js and inline styles, so a
   * script-src policy needs per-request nonces threaded through the document,
   * and a half-written CSP that silently blocks the 3D anatomy hub is worse
   * than none. `frame-ancestors` is the part that needs no nonce, so it ships.
   */
  async headers() {
    return [
      // The on-device food model. Files under a version folder never change
      // (a new model gets a new folder), so the phone may keep them forever.
      // model.json is excluded: it is how the app learns a new model exists.
      {
        source: "/models/:version/food.onnx",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Content-Type", value: "application/octet-stream" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          // Clickjacking. An attacker framing the app and overlaying their own
          // controls can get a signed-in member to click things they cannot
          // see. frame-ancestors is the modern form; X-Frame-Options is kept
          // for older web views, which is what a cheap Android phone has.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },

          // Stop the browser second-guessing a Content-Type and running an
          // uploaded file as script.
          { key: "X-Content-Type-Options", value: "nosniff" },

          // Downgrade to http is refused for two years, including subdomains.
          // Auth.js session cookies are Secure, so a stripped connection does
          // not merely leak -- it silently signs the user out.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },

          // Do not leak the path someone was on - which can name a gym or a
          // member id - to anything they click through to.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          // The app asks for a camera in the native shell, not in the browser.
          // Nothing here needs a microphone, a location or a payment handler,
          // so no embedded content gets to ask for one either.
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
