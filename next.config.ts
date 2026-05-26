import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // OG画像生成で同梱フォントを serverless bundle に含めるため
  outputFileTracingIncludes: {
    "/api/og/event/[id]": [
      "./app/api/og/event/[id]/NotoSansJP-700-japanese.woff2",
    ],
  },
};

export default nextConfig;
