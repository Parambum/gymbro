import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["three"],
  // multiple lockfiles exist up-tree; pin tracing to this project
  outputFileTracingRoot: process.cwd(),
  // the coach prompt is read from disk at runtime, so tracing has to ship it
  outputFileTracingIncludes: {
    "/api/coach": ["./shared/coach/system-prompt.md"],
  },
};

export default nextConfig;
