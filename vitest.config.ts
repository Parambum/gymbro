import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests only — the Fuel calorie engine, macro maths, portion resolution,
 * weight smoothing and day-boundary logic. Those are pure functions with no
 * database, no network and no React, which is exactly why they are the part
 * of the module that has no excuse for being untested.
 *
 * `@/` is resolved here to match tsconfig's path alias, so a test imports
 * exactly what the app imports.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /**
     * One forked process, not a worker pool per CPU. These are a few hundred
     * arithmetic assertions — parallelism buys nothing, and this machine OOMs
     * when a worker pool spins up alongside a `next build` (the same memory
     * pressure documented for hermesc in the mobile app's AGENTS.md).
     */
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
