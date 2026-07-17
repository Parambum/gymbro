import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["three"],
  // multiple lockfiles exist up-tree; pin tracing to this project
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
