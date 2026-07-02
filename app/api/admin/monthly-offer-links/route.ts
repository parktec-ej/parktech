export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { signEventToken } from "@/lib/event-token";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();

export async function GET(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const contractId = (req.nextUrl.searchParams.get("contractId") ?? "").trim();
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!contractId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { ok: false, error: "contractId and date(YYYY-MM-DD) required" },
      { status: 400 }
    );
  }

  const useUrl = `${APP_URL}/api/tenant/event-response/offer-use?token=${encodeURIComponent(
    signEventToken({ c: contractId, d: date, a: "offer_use" })
  )}`;
  const declineUrl = `${APP_URL}/api/tenant/event-response/offer-decline?token=${encodeURIComponent(
    signEventToken({ c: contractId, d: date, a: "offer_decline" })
  )}`;
  return NextResponse.json({ ok: true, useUrl, declineUrl });
}
