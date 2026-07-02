export const runtime = "nodejs";
import { NextResponse } from "next/server";

// 14日自動解放は廃止（event-monthly 承認待ち方式へ移行）。
// 誤起動時も何もしないよう no-op 化。開放は monthly-offer-batch と承認待ちフローが担う。
export async function GET() {
  return NextResponse.json({
    ok: true,
    disabled: true,
    note: "14-day auto-release retired; superseded by monthly-offer-batch",
  });
}
