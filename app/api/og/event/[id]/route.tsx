/**
 * イベント告知用 OG画像 動的生成（600x600 / public / Node.js runtime）
 *
 * 確実動作を優先しフォント無し版：
 * - システム表示テキストは英語にして system font で描画
 * - イベントタイトル等の日本語は □（豆腐）になる
 * - フォント外部fetch・Base64インラインともに function invocation failure を引き起こすため断念
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
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  return `${p.year}/${String(p.month).padStart(2, "0")}/${String(p.day).padStart(2, "0")} (${p.weekday})`;
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
          {/* 上部 */}
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

          {/* 中央タイトル */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              padding: "0 12px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: title.length > 20 ? 38 : 48,
                fontWeight: 700,
                lineHeight: 1.2,
                textAlign: "center",
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
              gap: 8,
            }}
          >
            <div style={{ display: "flex", fontSize: 20, fontWeight: 700 }}>
              {dateLine || " "}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 16,
                fontWeight: 700,
                opacity: 0.92,
              }}
            >
              {venue || " "}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 8,
                background: "#fff",
                color: "#1e40af",
                padding: "10px 22px",
                borderRadius: 999,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              PARKING RESERVATION
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 13,
                opacity: 0.85,
                marginTop: 4,
              }}
            >
              {RESERVE_URL_DISPLAY}
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
            background: "#1e40af",
            color: "#fff",
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          ParkTec East Japan
        </div>
      ),
      { width: 600, height: 600 }
    );
  }
}
