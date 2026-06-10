export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackNotification } from "@/lib/slack";

/**
 * 競合価格取得（ボーダレスパーキング セキスイハイムスーパーアリーナ = cat=9）。
 *
 * 仕組み:
 *   - https://borderless-parking.com/?cat=9&date=YYYYMMDD のHTML本体に
 *     各駐車場の価格が <li><i class="fas fa-yen-sign"></i>3,880円〜/日</li> の形で
 *     サーバーサイドで埋め込まれている。JS描画ではない。
 *   - ただし bot 系 UA だと ?p=6547（イベント案内）にリダイレクトされるため、
 *     ブラウザ相当の User-Agent を付けて取得する。
 *   - 取得HTMLから「円」価格を全部抜き、最安値を competitorPrice として保存。
 *
 * 対象: status が published / approved で、今日(JST)〜30日後 に開催のイベント
 *       （ボーダレスは「30日前〜2日前」しか予約不可なので、その窓に重なるものだけ叩く）。
 * 礼儀: イベント間に1.5秒スリープ。低頻度（週1想定）で運用すること。
 */

const BORDERLESS_BASE = "https://borderless-parking.com/";
const BORDERLESS_CAT = 9;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
};

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = [
    process.env.SCRAPE_SECRET,
    process.env.CRON_SECRET,
  ].filter(Boolean) as string[];
  if (expected.length === 0) return true;
  return expected.some((s) => header === `Bearer ${s}`);
}

/** DateTime → JSTの "YYYYMMDD" */
function ymdJstCompact(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).replace(/-/g, "");
}
/** DateTime → JSTの "YYYY-MM-DD"（表示用） */
function ymdJstDash(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/** HTMLから円価格を全部抜いて最安値と件数を返す */
function parseMinPrice(html: string): { min: number | null; count: number } {
  const prices: number[] = [];
  const re = /fa-yen-sign[\s\S]{0,80}?([\d,]+)\s*円/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    if (Number.isFinite(n) && n >= 100 && n <= 100000) prices.push(n);
  }
  if (prices.length === 0) return { min: null, count: 0 };
  return { min: Math.min(...prices), count: prices.length };
}

async function fetchCompetitorMin(ymdCompact: string): Promise<{
  min: number | null;
  count: number;
  blocked: boolean;
}> {
  const url = `${BORDERLESS_BASE}?cat=${BORDERLESS_CAT}&date=${ymdCompact}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: ctrl.signal });
    const html = await res.text();
    // 駐車場一覧が来ているか（来ていなければ UA で弾かれてリダイレクトされた可能性）
    const hasList = /type-parking/.test(html) || /fa-yen-sign/.test(html);
    const { min, count } = parseMinPrice(html);
    return { min, count, blocked: !hasList };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const fromDt = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 念のため前日から
  const toDt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30日後まで

  const events = await prisma.event.findMany({
    where: {
      status: { in: ["published", "approved"] },
      startAt: { gte: fromDt, lte: toDt },
    },
    select: {
      id: true,
      title: true,
      startAt: true,
      competitorPrice: true,
      ourPrice: true,
    },
    orderBy: { startAt: "asc" },
  });

  const results: {
    title: string;
    date: string;
    before: number | null;
    after: number | null;
    ourPrice: number | null;
    count: number;
    blocked: boolean;
  }[] = [];

  for (const ev of events) {
    const dateCompact = ymdJstCompact(ev.startAt);
    const dateDash = ymdJstDash(ev.startAt);

    let r: { min: number | null; count: number; blocked: boolean };
    try {
      r = await fetchCompetitorMin(dateCompact);
    } catch {
      r = { min: null, count: 0, blocked: true };
    }

    // 価格が取れた時だけ更新（取れない日は既存値を温存＝nullで上書きしない）
    if (r.min != null) {
      await prisma.event.update({
        where: { id: ev.id },
        data: { competitorPrice: r.min },
      });
    }

    results.push({
      title: ev.title,
      date: dateDash,
      before: ev.competitorPrice,
      after: r.min ?? ev.competitorPrice,
      ourPrice: ev.ourPrice,
      count: r.count,
      blocked: r.blocked,
    });

    await sleep(1500); // 競合サイトへの礼儀
  }

  // Slack サマリ
  const lines: string[] = ["📊 [cron] competitor-price 取得完了"];
  if (results.length === 0) {
    lines.push("対象イベントなし（30日窓内に公開イベントがありません）");
  } else {
    for (const r of results) {
      if (r.blocked) {
        lines.push(`⚠️ ${r.date} ${r.title}：取得失敗（UAブロック/リダイレクトの可能性）`);
      } else if (r.count === 0) {
        lines.push(`・${r.date} ${r.title}：競合の出品なし`);
      } else {
        const change = r.before !== r.after ? `${r.before ?? "-"} → ${r.after}` : `${r.after}`;
        const ours = r.ourPrice != null ? ` / 自社 ${r.ourPrice}` : "";
        lines.push(`・${r.date} ${r.title}：競合最安 ${change}円（${r.count}件）${ours}`);
      }
    }
  }
  await sendSlackNotification(lines.join("\n"));

  return NextResponse.json({ ok: true, count: results.length, results });
}
