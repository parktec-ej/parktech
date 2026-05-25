/**
 * イベント告知用 OG画像 動的生成（600x600 / public / Edge runtime）
 *
 * 段階的検証中: フォント外部fetch・内部 events API fetch をスキップして
 * 「単色背景・英数字のみ」で動作するか確認する。動けば段階的に機能を戻す。
 */

export const runtime = "edge";

import { ImageResponse } from "next/og";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: "#1e40af",
            color: "#fff",
            padding: "40px 36px",
            justifyContent: "space-between",
            fontFamily: "sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 4,
            }}
          >
            ParkTec East Japan
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              fontSize: 32,
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            Event #{id.slice(0, 8)}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              fontSize: 14,
              opacity: 0.85,
            }}
          >
            reserve.parktec-ej.com/places/rifu-main
          </div>
        </div>
      ),
      {
        width: 600,
        height: 600,
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=60",
        },
      }
    );
  } catch (e) {
    console.error("[og] render error:", e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
