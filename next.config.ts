import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署需要 standalone 输出模式
  output: "standalone",
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
