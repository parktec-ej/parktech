import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // 照会導線は /reservation/lookup に一本化した。
      // 既存の案内やブックマークを切らないよう恒久リダイレクトする。
      {
        source: "/reservation/verify",
        destination: "/reservation/lookup",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
