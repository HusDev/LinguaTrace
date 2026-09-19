import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* A self-contained server bundle, so the container carries the app and its
     runtime dependencies rather than the whole node_modules tree. */
  output: "standalone",
};

export default nextConfig;
