import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Windows workaround local. Vercel's Next.js adapter expects .next.
  distDir: process.env.VERCEL ? ".next" : ".next-build",
};

export default nextConfig;
