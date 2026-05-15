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
  /** 開場時間 HH:MM または null（先頭ペアの値） */
  doorOpen: string | null;
  /** 開演時間 HH:MM または null（先頭ペアの値） */
  showStart: string | null;
  /** 公式URL（チケットサイト等） */
  officialUrl: string | null;
  /** 日付別の時刻ペア（複数日程で時刻が異なる場合に使用） */
  timePairs: Array<{ doorOpen: string | null; showStart: string | null }>;
  /** 時刻テキスト全文（呼び出し元で日付別に解析するため） */
  timeText: string;
};

/**
 * テキストから 開場/開演 ペアを全て抽出する
 * 例: "9/9（水）11（金）開場17：30　開演18：30　/　9/12（土）開場15：30　開演16：30"
 * → [{doorOpen:"17:30", showStart:"18:30"}, {doorOpen:"15:30", showStart:"16:30"}]
 */
export function parseAllTimePairs(
  text: string
): Array<{ doorOpen: string | null; showStart: string | null }> {
  function toHalfWidth(s: string): string {
    return s.replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30)
    );
  }
  // 開場HH:MM 開演HH:MM のペアを全て抽出
  const pattern =
    /(?:開場|OPEN)[^\d０-９]*([０-９0-9]{1,2})[：:][　 ]*([０-９0-9]{2})[^開演OPEN]*(?:開演|START)[^\d０-９]*([０-９0-9]{1,2})[：:][　 ]*([０-９0-9]{2})/g;
  const pairs: Array<{ doorOpen: string | null; showStart: string | null }> =
    [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const dh = toHalfWidth(m[1]).padStart(2, "0");
    const dm = toHalfWidth(m[2]);
    const sh = toHalfWidth(m[3]).padStart(2, "0");
    const sm = toHalfWidth(m[4]);
    pairs.push({ doorOpen: `${dh}:${dm}`, showStart: `${sh}:${sm}` });
  }
  // 開演のみのパターン（開場なし）
  if (pairs.length === 0) {
    const onlyStart =
      /(?:開演|START)[^\d０-９]*([０-９0-9]{1,2})[：:][　 ]*([０-９0-9]{2})/g;
    while ((m = onlyStart.exec(text)) !== null) {
      const sh = toHalfWidth(m[1]).padStart(2, "0");
      const sm = toHalfWidth(m[2]);
      pairs.push({ doorOpen: null, showStart: `${sh}:${sm}` });
    }
  }
  return pairs;
}

/**
 * 日付文字列（"9/12"など）に対応する時刻ペアを返す。
 * 各ペアの出現位置の直前テキストを「コンテキスト」として、
 * その中に日付プレフィックス（"9/12" や "9月12日" 等）が含まれるかで判定。
 * 見つからなければ最初のペアを返す。
 */
export function selectTimePairForDate(
  timeText: string,
  date: string
): { doorOpen: string | null; showStart: string | null } {
  const allPairs = parseAllTimePairs(timeText);
  if (allPairs.length === 0) return { doorOpen: null, showStart: null };
  if (allPairs.length === 1) return allPairs[0];

  const ymdMatch = date.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!ymdMatch) return allPairs[0];
  const month = String(parseInt(ymdMatch[2]));
  const day = String(parseInt(ymdMatch[3]));
  // 数値の前後に他の数字が並ばないことを保証（"29/12" を "9/12" と誤認しない）
  const datePattern = new RegExp(
    `(?:^|\\D)${month}\\/${day}(?:\\D|$)|${month}月${day}日`
  );

  // 各ペアの出現位置を実テキストで再走査
  const pattern =
    /(?:開場|OPEN)[^\d０-９]*[０-９0-9]{1,2}[：:][　 ]*[０-９0-9]{2}[^開演OPEN]*(?:開演|START)[^\d０-９]*[０-９0-9]{1,2}[：:][　 ]*[０-９0-9]{2}/g;
  const indexes: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(timeText)) !== null) indexes.push(m.index);

  // 各ペアの「コンテキスト」= 前のペアの終端〜自分の開始位置
  for (let i = 0; i < Math.min(indexes.length, allPairs.length); i++) {
    const start = i === 0 ? 0 : indexes[i - 1];
    const end = indexes[i];
    const context = timeText.slice(start, end);
    if (datePattern.test(context)) return allPairs[i];
  }
  return allPairs[0];
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

  const timePairs = parseAllTimePairs(timeText);
  return {
    description,
    doorOpen: timePairs[0]?.doorOpen ?? null,
    showStart: timePairs[0]?.showStart ?? null,
    officialUrl,
    timePairs,
    timeText,
  };
}
