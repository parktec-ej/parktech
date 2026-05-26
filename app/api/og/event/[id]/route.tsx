/**
 * イベント告知用 OG画像 動的生成（600x600 / public / Node.js runtime）
 *
 * 設計メモ:
 * - 600x600 + フォント1種類でメモリを抑える（Edge は white image 問題で却下）
 * - 内部公開 API を経由せず Prisma 直接取得（Node ランタイムのみ可）
 * - フォント取得失敗 / event 取得失敗でも 500 を返さず英数字 fallback
 * - 絵文字は使用しない（Satori デフォルトで絵文字描画できないため）
 */

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

const VENUE_LABEL: Record<string, string> = {
  sekisui_arena: "セキスイハイムスーパーアリーナ",
  qanda_stadium: "キューアンドエースタジアムみやぎ",
};

const RESERVE_URL_DISPLAY = "reserve.parktec-ej.com/places/rifu-main";
const WEEKDAYS_JP = ["日", "月", "火", "水", "木", "金", "土"];

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function loadJpFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(
      text
    )}`;
    const cssRes = await fetchWithTimeout(
      cssUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      },
      3000
    );
    if (!cssRes || !cssRes.ok) {
      console.warn("[og] font CSS fetch failed:", cssRes?.status);
      return null;
    }
    const css = await cssRes.text();
    const m = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:woff2|woff)'\)/);
    if (!m) {
      console.warn("[og] font url not matched");
      return null;
    }
    const fontRes = await fetchWithTimeout(m[1], undefined, 3000);
    if (!fontRes || !fontRes.ok) {
      console.warn("[og] font binary fetch failed");
      return null;
    }
    return await fontRes.arrayBuffer();
  } catch (e) {
    console.warn("[og] loadJpFont error:", e);
    return null;
  }
}

// Edge ICU 不安定対策で手書きの JST 計算（nodejs でも同じ使用）
function jstDateParts(iso: string | null | undefined) {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const jst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
    weekday: WEEKDAYS_JP[jst.getUTCDay()],
    hour: jst.getUTCHours(),
    minute: jst.getUTCMinutes(),
  };
}

function fmtJstDate(iso: string | null | undefined): string {
  const p = jstDateParts(iso);
  if (!p) return "";
  return `${p.year}年${p.month}月${p.day}日（${p.weekday}）`;
}

function fmtJstTime(iso: string | null | undefined): string {
  const p = jstDateParts(iso);
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

    const title = event?.title ?? "イベント情報";
    const venue = event ? VENUE_LABEL[event.venue] ?? event.venue : "";
    const dateStr = event ? fmtJstDate(event.startAt.toISOString()) : "";
    const timeStr = event
      ? fmtJstTime(
          (event.showStartAt ?? event.doorOpenAt ?? event.startAt).toISOString()
        )
      : "";

    const allText = [
      "ParkTec East Japan",
      title,
      dateStr,
      timeStr,
      venue,
      "駐車場予約受付中",
      RESERVE_URL_DISPLAY,
    ].join("");
    const fontDataBold = await loadJpFont(allText);

    const fonts = fontDataBold
      ? [
          {
            name: "NotoJP",
            data: fontDataBold,
            weight: 700 as const,
            style: "normal" as const,
          },
        ]
      : undefined;

    const dateLine = dateStr
      ? `${dateStr}${timeStr ? ` / ${timeStr} 開演` : ""}`
      : "";
    const venueLine = venue || "";

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
            color: "#fff",
            fontFamily: "NotoJP, sans-serif",
            padding: "40px 36px",
            justifyContent: "space-between",
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
            <div
              style={{
                display: "flex",
                fontSize: 20,
                fontWeight: 700,
              }}
            >
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
              {venueLine || " "}
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
              }}
            >
              駐車場予約受付中
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
        fonts,
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      }
    );
  } catch (e) {
    console.error("[og] render error:", e);
    // 最後の手段: シンプルな PNG を返す
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
