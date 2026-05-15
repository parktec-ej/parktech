import * as cheerio from "cheerio";
import { fetchEucJpHtml } from "./fetch-html";

export const EVENT_LIST_URL =
  "https://www.mspf.jp/grande21/index.php?action=event_show_list";
export const EVENT_DETAIL_BASE =
  "https://www.mspf.jp/grande21/index.php?action=event_show_detail&event_id=";

export type ScrapedEventListItem = {
  /** Concert title / artist line, e.g. "桑田佳祐 コンサート" */
  title: string;
  /** "コンサート" などのカテゴリ文字列（HTML 上の表示） */
  category: string;
  /** "桑田佳祐 LIVE TOUR 2026 ..." 表に出ている説明（先頭〜省略） */
  description: string;
  /** YYYY-MM-DD 形式の開始日 */
  startDate: string | null;
  /** YYYY-MM-DD 形式の終了日（単日なら startDate と同じ） */
  endDate: string | null;
  /** 詳細リンク URL（event_id 付き） */
  detailUrl: string | null;
  /** event_id 部分（取れた場合のみ） */
  externalId: string | null;
};

const CONCERT_CATEGORIES = ["コンサート", "ライブ", "音楽"];

function isConcertCategory(category: string): boolean {
  return CONCERT_CATEGORIES.some((c) => category.includes(c));
}

/**
 * "2026.09/09(水)" → "2026-09-09"
 * Accepts also "2026/09/09" forms just in case.
 */
function normalizeJaDate(input: string): string | null {
  const v = input.replace(/\s/g, "");
  const m = v.match(/(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Parse the grande21 event-list HTML and return only concert-category
 * rows.  Returns an empty array if the table or rows can't be found
 * (the site can change its HTML at any time).
 */
export function parseEventListHtml(html: string): ScrapedEventListItem[] {
  const $ = cheerio.load(html);
  const rows = $("table.tbl-event-index tbody tr");
  const items: ScrapedEventListItem[] = [];

  rows.each((_, el) => {
    const $row = $(el);
    const $cells = $row.find("td");
    if ($cells.length < 4) return;

    const $titleAnchor = $cells.eq(0).find("a").first();
    const title = ($titleAnchor.text() || $cells.eq(0).text()).trim();
    const category = $cells.eq(1).text().trim();
    const description = $cells.eq(2).text().replace(/…+/g, "").trim();

    if (!isConcertCategory(category)) return;
    if (!title) return;

    const $dates = $cells.eq(3).find("span.nowrap");
    const startRaw = $dates.eq(0).text().trim();
    const endRaw = $dates.length > 1 ? $dates.eq(1).text().trim() : startRaw;

    const startDate = startRaw ? normalizeJaDate(startRaw) : null;
    const endDate = endRaw ? normalizeJaDate(endRaw) : startDate;

    const href = $titleAnchor.attr("href") ?? "";
    const eventIdMatch = href.match(/event_id=(\d+)/);
    const externalId = eventIdMatch ? eventIdMatch[1] : null;
    const detailUrl = externalId
      ? `${EVENT_DETAIL_BASE}${externalId}`
      : null;

    items.push({
      title,
      category,
      description,
      startDate,
      endDate,
      detailUrl,
      externalId,
    });
  });

  return items;
}

export async function scrapeEventList(): Promise<ScrapedEventListItem[]> {
  const html = await fetchEucJpHtml(EVENT_LIST_URL);
  return parseEventListHtml(html);
}

export type ScrapedEventDetail = {
  /** 完全な説明文 */
  description: string;
  /** 開場時間 HH:MM または null */
  doorOpen: string | null;
  /** 開演時間 HH:MM または null */
  showStart: string | null;
  /** 公式URL（チケットサイト等） */
  officialUrl: string | null;
};

/**
 * "開場17：30　開演18：30" のような文字列から HH:MM を抽出
 */
function parseTime(text: string, keyword: string): string | null {
  const pattern = new RegExp(keyword + "[\\s　]*([０-９0-9]{1,2})[：:｜|]([０-９0-9]{2})");
  const m = text.match(pattern);
  if (!m) return null;
  const h = String(parseInt(m[1].replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xFF10)))).padStart(2, "0");
  const min = m[2].replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xFF10));
  return `${h}:${min}`;
}

/**
 * グランディ21イベント詳細ページから開演時間・説明文・公式URLを取得
 */
export async function scrapeEventDetail(
  externalId: string
): Promise<ScrapedEventDetail> {
  const url = `${EVENT_DETAIL_BASE}${externalId}`;
  const html = await fetchEucJpHtml(url);
  const $ = cheerio.load(html);

  // 説明文：.event-detail-content または td.content など複数セレクタを試みる
  let description = "";
  const descCandidates = [
    ".event-detail-content",
    "td.content",
    ".detail-content",
    "#event-detail td:nth-child(2)",
  ];
  for (const sel of descCandidates) {
    const text = $(sel).first().text().trim();
    if (text.length > 10) { description = text; break; }
  }
  // fallback: テーブルの「内容」行を探す
  if (!description) {
    $("th, td").each((_, el) => {
      if ($(el).text().trim() === "内容") {
        description = $(el).next("td").text().trim();
      }
    });
  }

  // 開場・開演時間：「時間」行のテキストから抽出
  let timeText = "";
  $("th, td").each((_, el) => {
    const t = $(el).text().trim();
    if (/開場|開演|OPEN|START/.test(t) && t.length > 2) {
      timeText += " " + t + " " + $(el).next("td").text().trim();
    }
  });
  // ページ全体テキストからも探す
  const bodyText = $("body").text();
  const timeSection = bodyText.match(/開場.{0,60}開演.{0,30}/);
  if (timeSection) timeText += " " + timeSection[0];

  const doorOpen = parseTime(timeText, "開場");
  const showStart = parseTime(timeText, "開演");

  // 公式URL：外部リンクを探す
  let officialUrl: string | null = null;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (
      href.startsWith("http") &&
      !href.includes("mspf.jp") &&
      !officialUrl
    ) {
      officialUrl = href;
    }
  });

  return { description, doorOpen, showStart, officialUrl };
}
