/**
 * イベント告知用 OG画像 動的生成（600x600 / public, 認証なし / Edge runtime）
 *
 * 使い方:
 *   GET /api/og/event/<eventId>
 *   → PNG 画像 (600x600) を返す
 *
 * Instagram 投稿時の imageUrl にそのまま渡せる public URL。
 * Vercel CDN により response はキャッシュされる。
 *
 * Edge runtime のため Prisma を直接呼べないので、内部の public events API を fetch する。
 * (Public API は published のみ返すので、OG生成も published イベントのみ対応となる)
 */

export const runtime = "edge";

import { ImageResponse } from "next/og";

const VENUE_LABEL: Record<string, string> = {
  sekisui_arena: "セキスイハイムスーパーアリーナ",
  qanda_stadium: "キューアンドエースタジアムみやぎ",
};

const RESERVE_URL_DISPLAY = "reserve.parktec-ej.com/places/rifu-main";

// 共通の fetch + タイムアウト
async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Google Fonts CSS 経由で Noto Sans JP の woff2 を取得（失敗時 null）
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
    if (!cssRes || !cssRes.ok) return null;
    const css = await cssRes.text();
    const m = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:woff2|woff)'\)/);
    if (!m) return null;
    const fontRes = await fetchWithTimeout(m[1], undefined, 3000);
    if (!fontRes || !fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

function fmtJstDate(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
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

function fmtJstTime(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  });
}

type EventLite = {
  title: string;
  venue: string;
  startAt: string;
  showStartAt: string | null;
  doorOpenAt: string | null;
};

async function fetchEvent(req: Request, id: string): Promise<EventLite | null> {
  const url = new URL(`/api/public/events/${encodeURIComponent(id)}`, req.url);
  const res = await fetchWithTimeout(url.toString(), { cache: "no-store" }, 3000);
  if (!res || !res.ok) return null;
  try {
    const json = await res.json();
    if (!json?.ok || !json?.event) return null;
    return json.event as EventLite;
  } catch {
    return null;
  }
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const event = await fetchEvent(req, id);

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
          padding: "40px 36px",
          justifyContent: "space-between",
        }}
      >
        {/* 上部: ParkTec East Japan ロゴテキスト */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 4,
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
            padding: "0 12px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: title.length > 20 ? 38 : 48,
              fontWeight: 700,
              lineHeight: 1.2,
              textAlign: "center",
              maxWidth: 540,
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
            gap: 8,
          }}
        >
          {dateStr ? (
            <div
              style={{
                display: "flex",
                fontSize: 20,
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
                fontSize: 16,
                fontWeight: 700,
                opacity: 0.92,
              }}
            >
              📍 {venue}
            </div>
          ) : null}

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
            🅿️ 駐車場予約受付中
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
}
