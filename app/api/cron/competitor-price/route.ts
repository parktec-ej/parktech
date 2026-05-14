export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { sendSlackNotification } from "@/lib/slack";

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = [
    process.env.SCRAPE_SECRET,
    process.env.CRON_SECRET,
  ].filter(Boolean) as string[];
  if (expected.length === 0) return true;
  return expected.some((s) => header === `Bearer ${s}`);
}

/**
 * 競合価格スクレイピング（ボーダレスパーキング https://borderless-parking.com/?cat=9）。
 *
 * 現状はスタブ。HTML 構造を調査して安全に実装するまで取得は行わない。
 * cron 起動だけは通っているか確認するために Slack に1行だけ流す。
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  await sendSlackNotification(
    "🕊️ [cron] competitor-price スタブ実行（実装はフェーズ2 詳細化待ち）"
  );
  return NextResponse.json({
    ok: true,
    status: "stub",
    note: "borderless-parking.com の HTML 構造調査待ち。実装後に差し替え。",
  });
}
