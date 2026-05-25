/**
 * イベント告知用 OG画像 動的生成（1080x1080 / public, 認証なし）
 *
 * 使い方:
 *   GET /api/og/event/<eventId>
 *   → PNG 画像 (1080x1080) を返す
 *
 * Instagram 投稿時の imageUrl にそのまま渡せる public URL。
 * Vercel CDN により response はキャッシュされる。
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

// Google Fonts CSS 経由で Noto Sans JP の woff2 を取得
async function loadJpFont(text: string, weight: 400 | 700 = 700): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(
      text
    )}`;
    const css = await fetch(cssUrl, {
      headers: {
        // 新しい woff2 を返してもらうため UA をモダンブラウザに
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    }).then((r) => (r.ok ? r.text() : null));
    if (!css) return null;
    const m = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:woff2|woff)'\)/);
    if (!m) return null;
    const fontRes = await fetch(m[1]);
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

function fmtJstDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}年${get("month")}月${get("day")}日（${get("weekday")}）`;
}

function fmtJstTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
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
  const dateStr = event ? fmtJstDate(event.startAt) : "";
  const timeStr = event
    ? fmtJstTime(event.showStartAt ?? event.doorOpenAt ?? event.startAt)
    : "";

  // 描画する全テキストをまとめて font subset を取得（容量最小化）
  const allText = [
    "ParkTec East Japan",
    title,
    dateStr,
    timeStr,
    venue,
    "駐車場予約受付中",
    RESERVE_URL_DISPLAY,
  ].join("");
  const fontDataBold = await loadJpFont(allText, 700);
  const fontDataRegular = await loadJpFont(allText, 400);
  const fonts: Array<{
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700;
    style: "normal";
  }> = [];
  if (fontDataBold)
    fonts.push({ name: "NotoJP", data: fontDataBold, weight: 700, style: "normal" });
  if (fontDataRegular)
    fonts.push({ name: "NotoJP", data: fontDataRegular, weight: 400, style: "normal" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)",
          color: "#fff",
          fontFamily: "NotoJP, sans-serif",
          padding: "72px 64px",
          justifyContent: "space-between",
        }}
      >
        {/* 上部: ParkTec East Japan ロゴテキスト */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: 6,
            opacity: 0.95,
          }}
        >
          ParkTec East Japan
        </div>

        {/* 中央: イベント名 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            flex: 1,
            padding: "0 24px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: title.length > 20 ? 64 : 80,
              fontWeight: 700,
              lineHeight: 1.2,
              textAlign: "center",
              maxWidth: 900,
            }}
          >
            {title}
          </div>
        </div>

        {/* 下部: 日程・会場・予約案内 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}
        >
          {dateStr ? (
            <div
              style={{
                display: "flex",
                fontSize: 32,
                fontWeight: 700,
              }}
            >
              📅 {dateStr}
              {timeStr ? ` ／ ${timeStr} 開演` : ""}
            </div>
          ) : null}
          {venue ? (
            <div
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 400,
                opacity: 0.92,
              }}
            >
              📍 {venue}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              marginTop: 12,
              background: "#fff",
              color: "#1e40af",
              padding: "16px 36px",
              borderRadius: 999,
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            🅿️ 駐車場予約受付中
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 22,
              opacity: 0.85,
              marginTop: 6,
            }}
          >
            {RESERVE_URL_DISPLAY}
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        // Vercel CDN で1時間キャッシュ
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    }
  );
}
