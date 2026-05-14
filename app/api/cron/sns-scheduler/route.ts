export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return header === `Bearer ${expected}`;
}

/**
 * フェーズ6 で実装予定の自動投稿スケジューラー本体は未実装。
 *
 * Vercel cron 設定だけ先に入れているので、当面はこのハンドラーが 501 を返す。
 * 即時投稿・予約投稿（Facebook 側スケジューリング）はフェーズ5 で実装済みのため、
 * このスケジューラーは「自動トリガー（残枠 ≤ 10、満車・キャンセル）」用途。
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error: "not_implemented",
      message: "sns-scheduler is reserved for Phase 6",
    },
    { status: 501 }
  );
}
