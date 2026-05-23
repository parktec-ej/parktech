export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getMonthlyStatus } from "@/lib/monthly-status";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const status = await getMonthlyStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (e: any) {
    console.error("[admin/monthly-status] error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}
