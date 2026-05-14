import * as cheerio from "cheerio";
import { fetchBytes, fetchEucJpHtml } from "./fetch-html";

export const PDF_LIST_URL =
  "https://www.mspf.jp/grande21/index.php?action=schedule_show_list";
export const PDF_DOWNLOAD_BASE =
  "https://www.mspf.jp/grande21/common/upload_attached_file.php?uaf_id=";

export type ScrapedPdfLink = {
  uafId: string;
  title: string;
  url: string;
};

/**
 * Title patterns we keep. PDFs whose title contains any of these
 * tokens are considered relevant for parking event extraction.
 */
const INCLUDE_TOKENS = ["月間予定", "セキスイハイム", "スーパーアリーナ", "キューアンドエースタジアム"];

/**
 * Title patterns we drop. Even if INCLUDE_TOKENS matches, anything
 * here disqualifies the row (e.g. "プール利用月間予定" → drop).
 */
const EXCLUDE_TOKENS = ["レッスン", "プール", "テニス", "トレーニング", "貸切", "会議室"];

function shouldKeepTitle(title: string): boolean {
  if (!title) return false;
  if (EXCLUDE_TOKENS.some((t) => title.includes(t))) return false;
  return INCLUDE_TOKENS.some((t) => title.includes(t));
}

/**
 * Parse the schedule_show_list HTML and return PDF links that
 * pass the include/exclude filter.
 */
export function parsePdfListHtml(html: string): ScrapedPdfLink[] {
  const $ = cheerio.load(html);
  const links: ScrapedPdfLink[] = [];
  const seen = new Set<string>();

  $('a[href*="upload_attached_file.php"]').each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href") ?? "";
    const m = href.match(/uaf_id=(\d+)/);
    if (!m) return;
    const uafId = m[1];
    if (seen.has(uafId)) return;

    // Title: prefer anchor text, fall back to nearest <th>/<td> column header
    const anchorText = $a.text().trim();
    const rowText = $a.closest("tr").text().replace(/\s+/g, " ").trim();
    const title = anchorText || rowText;

    if (!shouldKeepTitle(title)) return;

    seen.add(uafId);
    links.push({
      uafId,
      title,
      url: `${PDF_DOWNLOAD_BASE}${uafId}`,
    });
  });

  return links;
}

export async function scrapePdfList(): Promise<ScrapedPdfLink[]> {
  const html = await fetchEucJpHtml(PDF_LIST_URL);
  return parsePdfListHtml(html);
}

export async function downloadPdf(uafId: string): Promise<Buffer> {
  return fetchBytes(`${PDF_DOWNLOAD_BASE}${uafId}`);
}
