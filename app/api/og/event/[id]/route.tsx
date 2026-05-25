/**
 * イベント告知用 OG画像 動的生成（600x600 / public, 認証なし / Edge runtime）
 *
 * 使い方:
 *   GET /api/og/event/<eventId>
 *
 * 設計メモ:
 * - Edge runtime の Intl.DateTimeFormat は ICU データが限定的で
 *   日本語 weekday などの formatToParts が壊れる事があるため、JST計算は手書き。
 * - フォント取得失敗 / event取得失敗 でも 500 を返さず英数字フォールバックで PNG を返す。
 * - ImageResponse のレンダー例外を最外で catch して error PNG を返す。
 */

export const runtime = "edge";

import { ImageResponse } from "next/og";

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
      console.warn("[og] font url not matched in CSS");
      return null;
    }
    const fontRes = await fetchWithTimeout(m[1], undefined, 3000);
    if (!fontRes || !fontRes.ok) {
      console.warn("[og] font binary fetch failed:", fontRes?.status);
      return null;
    }
    return await fontRes.arrayBuffer();
  } catch (e) {
    console.warn("[og] loadJpFont error:", e);
    return null;
  }
}

// Edge ランタイム互換: UTC ミリ秒に +9h して getUTC* で JST 値を取り出す
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
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

type EventLite = {
  title: string;
  venue: string;
  startAt: string;
  showStartAt: string | null;
  doorOpenAt: string | null;
};

async function fetchEvent(req: Request, id: string): Promise<EventLite | null> {
  try {
    const url = new URL(`/api/public/events/${encodeURIComponent(id)}`, req.url);
    const res = await fetchWithTimeout(
      url.toString(),
      { cache: "no-store" },
      3000
    );
    if (!res || !res.ok) {
      console.warn("[og] event fetch failed:", res?.status, url.toString());
      return null;
    }
    const json = await res.json();
    if (!json?.ok || !json?.event) {
      console.warn("[og] event payload empty");
      return null;
    }
    return json.event as EventLite;
  } catch (e) {
    console.warn("[og] fetchEvent error:", e);
    return null;
  }
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  console.log("[og] GET start");
  try {
    const { id } = await context.params;
    console.log("[og] id:", id);

    const event = await fetchEvent(req, id);
    console.log("[og] event fetched:", event?.title ?? "(null)");

    const title = event?.title ?? "イベント情報";
    const venue = event ? VENUE_LABEL[event.venue] ?? event.venue : "";
    const dateStr = event ? fmtJstDate(event.startAt) : "";
    const timeStr = event
      ? fmtJstTime(event.showStartAt ?? event.doorOpenAt ?? event.startAt)
      : "";
    console.log("[og] computed:", { title, venue, dateStr, timeStr });

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
    console.log("[og] font loaded:", !!fontDataBold);

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
      ? `${dateStr}${timeStr ? ` ／ ${timeStr} 開演` : ""}`
      : "";
    const venueLine = venue ? `${venue}` : "";

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
          {/* 上部: ロゴテキスト */}
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

          {/* 中央: タイトル */}
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
    // ImageResponse 失敗時の safety net: 純粋にシンプルな PNG を返す
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
