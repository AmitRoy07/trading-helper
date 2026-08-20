import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid collisions with an older create-next-app cache on Windows.
  distDir: ".next-build",
};

export default nextConfig;
