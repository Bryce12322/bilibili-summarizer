import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许加载 Bilibili 的封面图片
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i0.hdslb.com" },
      { protocol: "https", hostname: "i1.hdslb.com" },
      { protocol: "https", hostname: "i2.hdslb.com" },
    ],
  },
};

export default nextConfig;
