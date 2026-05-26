// 最小限の ImageResponse テスト用エンドポイント。
// 絵文字なし・フォントなし・JSX 最小で nodejs runtime の動作確認。
export const runtime = "nodejs";

import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1e40af",
          color: "#fff",
          fontSize: 60,
          fontWeight: 700,
        }}
      >
        Hello OG
      </div>
    ),
    { width: 600, height: 600 }
  );
}
