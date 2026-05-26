/**
 * イベント告知用 OG画像 動的生成（600x600 / public / Node.js runtime）
 *
 * リッチデザイン版 (フォント無し / 英語表記):
 * - 多層グラデーション背景（紺→紫 + radial-gradient の光アクセント）
 * - ゴールドの装飾線・四隅ダイヤモンド
 * - 中央タイトル + 装飾ライン
 * - PARKING RESERVATION ボタン（ゴールドボーダー）
 */

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

const VENUE_LABEL: Record<string, string> = {
  sekisui_arena: "Sekisui Heim Super Arena",
  qanda_stadium: "Q&A Stadium Miyagi",
};

const RESERVE_URL_DISPLAY = "reserve.parktec-ej.com/places/rifu-main";
const WEEKDAYS_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const COLOR_GOLD = "#fbbf24";
const COLOR_LIGHT_GRAY = "#e2e8f0";

function jstDateParts(d: Date | null | undefined) {
  if (!d) return null;
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
    weekday: WEEKDAYS_EN[jst.getUTCDay()],
    hour: jst.getUTCHours(),
    minute: jst.getUTCMinutes(),
  };
}

function fmtDateEn(d: Date | null | undefined): string {
  const p = jstDateParts(d);
  if (!p) return "";
  return `${p.year}.${String(p.month).padStart(2, "0")}.${String(p.day).padStart(2, "0")} ${p.weekday}`;
}

function fmtTimeEn(d: Date | null | undefined): string {
  const p = jstDateParts(d);
  if (!p) return "";
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

// 四隅のダイヤモンド装飾（ゴールド・45度回転した四角）
function CornerDiamond({
  top,
  right,
  bottom,
  left,
}: {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        width: 8,
        height: 8,
        background: COLOR_GOLD,
        transform: "rotate(45deg)",
        ...(top !== undefined ? { top } : {}),
        ...(right !== undefined ? { right } : {}),
        ...(bottom !== undefined ? { bottom } : {}),
        ...(left !== undefined ? { left } : {}),
      }}
    />
  );
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        title: true,
        venue: true,
        startAt: true,
        showStartAt: true,
        doorOpenAt: true,
      },
    });

    const title = event?.title ?? "Event";
    const venue = event ? VENUE_LABEL[event.venue] ?? event.venue : "";
    const dateStr = event ? fmtDateEn(event.startAt) : "";
    const timeStr = event
      ? fmtTimeEn(event.showStartAt ?? event.doorOpenAt ?? event.startAt)
      : "";
    const dateLine = dateStr ? `${dateStr}  /  ${timeStr || "TBA"}` : "";

    // タイトル長で font size 調整 (600x600 用)
    const titleFontSize =
      title.length > 28 ? 32 : title.length > 18 ? 40 : 50;

    return new ImageResponse(
      (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            fontFamily: "sans-serif",
            // ベースグラデーション
            background:
              "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)",
            overflow: "hidden",
          }}
        >
          {/* 光のアクセント (左上) */}
          <div
            style={{
              position: "absolute",
              top: -120,
              left: -120,
              width: 380,
              height: 380,
              display: "flex",
              background:
                "radial-gradient(circle, rgba(59,130,246,0.35) 0%, rgba(59,130,246,0) 70%)",
            }}
          />
          {/* 光のアクセント (右下) */}
          <div
            style={{
              position: "absolute",
              bottom: -120,
              right: -120,
              width: 380,
              height: 380,
              display: "flex",
              background:
                "radial-gradient(circle, rgba(168,85,247,0.35) 0%, rgba(168,85,247,0) 70%)",
            }}
          />

          {/* 上下のゴールド細線 */}
          <div
            style={{
              position: "absolute",
              top: 24,
              left: 36,
              right: 36,
              height: 1,
              display: "flex",
              background: COLOR_GOLD,
              opacity: 0.7,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 24,
              left: 36,
              right: 36,
              height: 1,
              display: "flex",
              background: COLOR_GOLD,
              opacity: 0.7,
            }}
          />

          {/* 四隅ダイヤモンド */}
          <CornerDiamond top={20} left={20} />
          <CornerDiamond top={20} right={20} />
          <CornerDiamond bottom={20} left={20} />
          <CornerDiamond bottom={20} right={20} />

          {/* 中身 */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              padding: "60px 56px",
              color: "#fff",
              justifyContent: "space-between",
            }}
          >
            {/* 上部: ロゴ */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {/* "P" マーク（金枠の円） */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  border: `2px solid ${COLOR_GOLD}`,
                  background: "rgba(251,191,36,0.08)",
                  color: COLOR_GOLD,
                  fontSize: 32,
                  fontWeight: 900,
                  letterSpacing: 0,
                }}
              >
                P
              </div>
              <div
                style={{
                  display: "flex",
                  marginTop: 14,
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: 6,
                  color: COLOR_GOLD,
                }}
              >
                ParkTec East Japan
              </div>
            </div>

            {/* 中央: タイトル */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                padding: "0 8px",
              }}
            >
              {/* 装飾ライン (上) ─── ✦ ─── */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  marginBottom: 18,
                  color: COLOR_GOLD,
                  opacity: 0.8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 56,
                    height: 1,
                    background: COLOR_GOLD,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    fontSize: 14,
                    color: COLOR_GOLD,
                  }}
                >
                  ✦
                </div>
                <div
                  style={{
                    display: "flex",
                    width: 56,
                    height: 1,
                    background: COLOR_GOLD,
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  fontSize: titleFontSize,
                  fontWeight: 900,
                  lineHeight: 1.18,
                  textAlign: "center",
                  textShadow: "0 4px 12px rgba(0,0,0,0.55)",
                  letterSpacing: 1,
                  color: "#fff",
                }}
              >
                {title}
              </div>

              {/* 装飾ライン (下) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  marginTop: 18,
                  opacity: 0.8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 56,
                    height: 1,
                    background: COLOR_GOLD,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    fontSize: 14,
                    color: COLOR_GOLD,
                  }}
                >
                  ✦
                </div>
                <div
                  style={{
                    display: "flex",
                    width: 56,
                    height: 1,
                    background: COLOR_GOLD,
                  }}
                />
              </div>
            </div>

            {/* 下部 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: 2,
                  color: COLOR_LIGHT_GRAY,
                }}
              >
                {dateLine || " "}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 15,
                  fontWeight: 700,
                  color: COLOR_LIGHT_GRAY,
                  opacity: 0.85,
                  letterSpacing: 1,
                }}
              >
                {venue || " "}
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: 18,
                  background: "rgba(15,23,42,0.55)",
                  color: COLOR_GOLD,
                  padding: "12px 28px",
                  borderRadius: 8,
                  border: `2px solid ${COLOR_GOLD}`,
                  fontSize: 19,
                  fontWeight: 900,
                  letterSpacing: 3,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
                }}
              >
                [P] PARKING RESERVATION
              </div>

              <div
                style={{
                  display: "flex",
                  fontSize: 12,
                  opacity: 0.7,
                  marginTop: 10,
                  letterSpacing: 1,
                  color: "#fff",
                }}
              >
                {RESERVE_URL_DISPLAY}
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 600,
        height: 600,
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      }
    );
  } catch (e) {
    console.error("[og] render error:", e);
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: COLOR_GOLD,
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: 6,
          }}
        >
          ParkTec East Japan
        </div>
      ),
      { width: 600, height: 600 }
    );
  }
}
