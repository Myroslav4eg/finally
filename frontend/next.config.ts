import type { NextConfig } from "next";

/** Static export, served by FastAPI on the same origin as /api. */
const nextConfig: NextConfig = {
  // This project is the workspace root; do not walk up to an outer lockfile.
  turbopack: { root: import.meta.dirname },
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
