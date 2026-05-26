/**
 * イベント告知用 OG画像 動的生成（1080x1080 / public / Node.js runtime）
 *
 * デザイン改善版 (フォント無し / 英語表記):
 * - 背景: 駐車場写真 + 青半透明オーバーレイ
 * - 上部: ParkTec East Japan ロゴ（大きく、letter-spacing 広め）
 * - 中央: イベント名（シャドウ付き）
 * - 下部: 日付 / 会場名（英語）/ PARKING RESERVATION ボタン / URL
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
const BG_IMAGE_URL = "https://reserve.parktec-ej.com/images/rifu-main/lot-full.jpg";
const WEEKDAYS_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

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
  const y = p.year;
  const mo = String(p.month).padStart(2, "0");
  const day = String(p.day).padStart(2, "0");
  return `${y}.${mo}.${day} ${p.weekday}`;
}

function fmtTimeEn(d: Date | null | undefined): string {
  const p = jstDateParts(d);
  if (!p) return "";
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
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
    const dateLine = dateStr ? `${dateStr}${timeStr ? `  /  ${timeStr}` : ""}` : "";

    // タイトル長に応じてフォントサイズを調整
    const titleFontSize =
      title.length > 30 ? 64 : title.length > 20 ? 80 : 96;

    return new ImageResponse(
      (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            fontFamily: "sans-serif",
          }}
        >
          {/* 背景写真 */}
          <img
            src={BG_IMAGE_URL}
            width={1080}
            height={1080}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />

          {/* 青半透明オーバーレイ */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "rgba(30, 64, 175, 0.85)",
              display: "flex",
            }}
          />

          {/* コンテンツ */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              padding: "72px 64px 64px 64px",
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
              <div
                style={{
                  display: "flex",
                  fontSize: 44,
                  fontWeight: 900,
                  letterSpacing: 8,
                  textTransform: "uppercase",
                }}
              >
                ParkTec
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: 12,
                  marginTop: 6,
                  opacity: 0.85,
                }}
              >
                EAST JAPAN
              </div>
              <div
                style={{
                  display: "flex",
                  width: 64,
                  height: 3,
                  background: "#fff",
                  marginTop: 24,
                  opacity: 0.7,
                }}
              />
            </div>

            {/* 中央: イベント名 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                padding: "0 16px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: titleFontSize,
                  fontWeight: 900,
                  lineHeight: 1.15,
                  textAlign: "center",
                  textShadow: "0 4px 12px rgba(0,0,0,0.35)",
                  letterSpacing: 1,
                }}
              >
                {title}
              </div>
            </div>

            {/* 下部 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: 2,
                  opacity: 0.95,
                }}
              >
                {dateLine || " "}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  fontWeight: 700,
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
                  background: "rgba(255,255,255,0.95)",
                  color: "#1e40af",
                  padding: "16px 40px",
                  borderRadius: 12,
                  border: "2px solid #fff",
                  fontSize: 28,
                  fontWeight: 900,
                  letterSpacing: 4,
                  boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
                }}
              >
                PARKING RESERVATION
              </div>

              <div
                style={{
                  display: "flex",
                  fontSize: 18,
                  opacity: 0.75,
                  marginTop: 12,
                  letterSpacing: 1,
                }}
              >
                {RESERVE_URL_DISPLAY}
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1080,
        height: 1080,
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
            background: "#1e40af",
            color: "#fff",
            fontSize: 56,
            fontWeight: 900,
            letterSpacing: 6,
          }}
        >
          ParkTec East Japan
        </div>
      ),
      { width: 1080, height: 1080 }
    );
  }
}
