export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackNotification, sendSlackAlert } from "@/lib/slack";
import {
  scrapeEventList,
  scrapeEventDetail,
  selectTimePairForDate,
  type ScrapedEventListItem,
} from "@/lib/scraping/event-list";
import {
  scrapePdfList,
  downloadPdf,
  type ScrapedPdfLink,
} from "@/lib/scraping/pdf-list";
import { politeWait } from "@/lib/scraping/fetch-html";
import { extractEventsFromPdf, type ExtractedEvent } from "@/lib/claude-pdf";

/**
 * `SCRAPE_SECRET` または `CRON_SECRET` のどちらかが `Authorization: Bearer ...`
 * に一致すれば許可。Vercel cron は CRON_SECRET をデフォルトで付与する。
 */
function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = [
    process.env.SCRAPE_SECRET,
    process.env.CRON_SECRET,
  ].filter(Boolean) as string[];
  if (expected.length === 0) return true; // env が無ければ permissive（開発時）
  return expected.some((s) => header === `Bearer ${s}`);
}

function ymdToUtcStartOfJstDay(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

function buildStartAt(date: string, showStart: string | null): Date {
  const hhmm = showStart ?? "18:00";
  return new Date(`${date}T${hhmm}:00+09:00`);
}

/**
 * 既存 Event の重複判定。
 * 「同じ venue」「同じ開催日 (JST)」のときに同一とみなす。
 * タイトル違い（PDF・一覧・手動）でも同日同会場なら2件目以降は skip される。
 */
function jstDate(d: Date): string {
  // JST の YYYY-MM-DD。toISOString は UTC で日付がズレるため sv-SE を使う。
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

async function upsertEventsBatch(params: {
  source: "event_list" | "schedule_pdf";
  rows: Array<{
    title: string;
    venue: "sekisui_arena" | "qanda_stadium";
    startAt: Date;
    endAt: Date | null;
    doorOpenAt: Date | null;
    showStartAt: Date | null;
    sourceUrl: string | null;
    sourcePdfId: string | null;
    description: string;
  }>;
}): Promise<{ created: number; skipped: number; createdTitles: string[] }> {
  const { source, rows } = params;
  let created = 0;
  let skipped = 0;
  const createdTitles: string[] = [];

  // Pre-load existing events in the same date range for dedupe
  const startAts = rows.map((r) => r.startAt.getTime());
  if (startAts.length === 0) return { created, skipped, createdTitles };

  const minStart = new Date(Math.min(...startAts) - 24 * 3600 * 1000);
  const maxStart = new Date(Math.max(...startAts) + 24 * 3600 * 1000);

  const existing = await prisma.event.findMany({
    where: { startAt: { gte: minStart, lte: maxStart } },
    select: { title: true, venue: true, startAt: true, status: true },
  });
  const existingKeys = new Set(
    existing.map(
      (e) =>
        `${e.venue}|${jstDate(e.startAt)}`
    )
  );

  for (const row of rows) {
    const key = `${row.venue}|${jstDate(row.startAt)}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    await prisma.event.create({
      data: {
        title: row.title,
        description: row.description || null,
        venue: row.venue,
        category: "concert",
        startAt: row.startAt,
        endAt: row.endAt,
        doorOpenAt: row.doorOpenAt,
        showStartAt: row.showStartAt,
        sourceType: source,
        sourceUrl: row.sourceUrl,
        sourcePdfId: row.sourcePdfId,
        status: "draft",
        venueGroupId: "grandee21",
      },
    });
    existingKeys.add(key);
    created++;
    createdTitles.push(row.title);
  }
  return { created, skipped, createdTitles };
}

function inferVenue(text: string): "sekisui_arena" | "qanda_stadium" {
  // Default to sekisui_arena (the arena). When the row text contains
  // "スタジアム", treat as qanda_stadium.
  if (/スタジアム/.test(text)) return "qanda_stadium";
  return "sekisui_arena";
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const startedAt = Date.now();
  const report: {
    listScraped: number;
    listCreated: number;
    pdfsListed: number;
    pdfsParsed: number;
    pdfsSkipped: number;
    pdfEventsCreated: number;
    errors: string[];
  } = {
    listScraped: 0,
    listCreated: 0,
    pdfsListed: 0,
    pdfsParsed: 0,
    pdfsSkipped: 0,
    pdfEventsCreated: 0,
    errors: [],
  };
  const createdTitles: string[] = [];

  // STEP 1: イベント一覧スクレイピング
  let listItems: ScrapedEventListItem[] = [];
  try {
    listItems = await scrapeEventList();
    report.listScraped = listItems.length;
  } catch (e) {
    const msg = `event_list_scrape_failed: ${
      e instanceof Error ? e.message : String(e)
    }`;
    report.errors.push(msg);
    await sendSlackAlert(`⚠️ [scrape-events] ${msg}`);
  }

  // 1秒以上の polite wait
  await politeWait();

  // STEP 1B: 一覧から取り込み（コンサートのみ・date あり）
  if (listItems.length > 0) {
    // 複数日公演を1日ごとに展開するヘルパー
    function expandDates(startDate: string, endDate: string | null): string[] {
      if (!endDate || endDate <= startDate) return [startDate];
      const dates: string[] = [];
      const cur = new Date(`${startDate}T00:00:00+09:00`);
      const end = new Date(`${endDate}T00:00:00+09:00`);
      while (cur <= end) {
        // JST の YYYY-MM-DD を取得（toISOString だと UTC で 1日ズレる）
        dates.push(
          cur.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
        );
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    }

    const filtered = listItems.filter((it) => it.startDate);
    const rowsArrays: Array<
      Array<{
        title: string;
        venue: "sekisui_arena" | "qanda_stadium";
        startAt: Date;
        endAt: Date | null;
        doorOpenAt: Date | null;
        showStartAt: Date | null;
        sourceUrl: string | null;
        sourcePdfId: null;
        description: string;
      }>
    > = [];
    for (const it of filtered) {
      const dates = expandDates(it.startDate!, it.endDate ?? null);
      const venue = inferVenue(`${it.title} ${it.description}`);

      // 詳細ページから開演時間・説明文・公式URLを取得
      let detail: {
        description: string;
        doorOpen: string | null;
        showStart: string | null;
        officialUrl: string | null;
        timePairs: Array<{ doorOpen: string | null; showStart: string | null }>;
        timeText: string;
      } = {
        description: it.description,
        doorOpen: null,
        showStart: null,
        officialUrl: null,
        timePairs: [],
        timeText: "",
      };
      if (it.externalId) {
        try {
          await politeWait();
          detail = await scrapeEventDetail(it.externalId);
        } catch (e) {
          console.warn(`detail fetch failed for ${it.externalId}:`, e);
        }
      }

      rowsArrays.push(
        dates.map((date) => {
          const timePair = detail.timeText
            ? selectTimePairForDate(detail.timeText, date)
            : { doorOpen: detail.doorOpen, showStart: detail.showStart };
          return {
            title: it.title,
            venue,
            startAt: buildStartAt(date, timePair.showStart),
            endAt: null,
            doorOpenAt: timePair.doorOpen
              ? new Date(`${date}T${timePair.doorOpen}:00+09:00`)
              : null,
            showStartAt: timePair.showStart
              ? new Date(`${date}T${timePair.showStart}:00+09:00`)
              : null,
            sourceUrl: detail.officialUrl ?? it.detailUrl,
            sourcePdfId: null,
            description: detail.description || it.description,
          };
        })
      );
    }
    const rows = rowsArrays.flat();
    try {
      const r = await upsertEventsBatch({ source: "event_list", rows });
      report.listCreated = r.created;
      createdTitles.push(...r.createdTitles);
    } catch (e) {
      const msg = `event_list_upsert_failed: ${
        e instanceof Error ? e.message : String(e)
      }`;
      report.errors.push(msg);
    }
  }

  // STEP 2: PDF リスト取得
  let pdfLinks: ScrapedPdfLink[] = [];
  try {
    pdfLinks = await scrapePdfList();
    report.pdfsListed = pdfLinks.length;
  } catch (e) {
    const msg = `pdf_list_scrape_failed: ${
      e instanceof Error ? e.message : String(e)
    }`;
    report.errors.push(msg);
    await sendSlackAlert(`⚠️ [scrape-events] ${msg}`);
  }

  // STEP 2B: 未取得 PDF だけ DL → Claude で解析 → upsert
  for (const link of pdfLinks) {
    const seen = await prisma.scrapedPdf.findUnique({
      where: { uafId: link.uafId },
    });
    if (seen) {
      report.pdfsSkipped++;
      continue;
    }

    await politeWait();

    try {
      const bytes = await downloadPdf(link.uafId);
      const extracted: ExtractedEvent[] = await extractEventsFromPdf(bytes);

      const rows = extracted
        .filter((e) => e.date)
        .map((e) => {
          const startAt = buildStartAt(e.date, e.showStart);
          const endAt = e.endDate ? ymdToUtcStartOfJstDay(e.endDate) : null;
          const doorOpenAt = e.doorOpen
            ? new Date(`${e.date}T${e.doorOpen}:00+09:00`)
            : null;
          const showStartAt = e.showStart
            ? new Date(`${e.date}T${e.showStart}:00+09:00`)
            : null;
          return {
            title: e.title,
            venue: e.venue,
            startAt,
            endAt,
            doorOpenAt,
            showStartAt,
            sourceUrl: null,
            sourcePdfId: link.uafId,
            description: e.notes ?? "",
          };
        });

      const r = await upsertEventsBatch({ source: "schedule_pdf", rows });
      report.pdfsParsed++;
      report.pdfEventsCreated += r.created;
      createdTitles.push(...r.createdTitles);

      // PDF を取得済みとして記録（差分管理）
      await prisma.scrapedPdf.create({
        data: {
          uafId: link.uafId,
          title: link.title,
          url: link.url,
          eventCount: extracted.length,
        },
      });
    } catch (e) {
      const msg = `pdf_parse_failed uafId=${link.uafId}: ${
        e instanceof Error ? e.message : String(e)
      }`;
      report.errors.push(msg);
      await sendSlackAlert(`⚠️ [scrape-events] ${msg}`);
    }
  }

  // STEP 5: Slack 通知
  const totalCreated = report.listCreated + report.pdfEventsCreated;
  if (totalCreated > 0) {
    await sendSlackNotification(
      [
        `📥 [scrape-events] 新着イベント ${totalCreated}件を登録しました`,
        `  list scraped=${report.listScraped} → created=${report.listCreated}`,
        `  pdf listed=${report.pdfsListed} parsed=${report.pdfsParsed} skipped(取得済)=${report.pdfsSkipped} events=${report.pdfEventsCreated}`,
        `  失敗: ${report.errors.length}`,
        ...createdTitles.slice(0, 10).map((t) => `  • ${t}`),
      ].join("\n")
    );
  } else if (report.errors.length === 0) {
    // 静かに完了。Slack には流さない（ノイズ防止）。
    console.log("[scrape-events] no new events");
  }

  return NextResponse.json({
    ok: report.errors.length === 0,
    elapsedMs: Date.now() - startedAt,
    ...report,
    createdTitles,
  });
}
