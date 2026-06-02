export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPartnerSession } from "@/lib/partner-auth";

export async function GET() {
  const session = await getPartnerSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    // バス予約のみ（reservationType="bus"）。一般予約(general)は混ざらない。
    // バス事業者は1社・共通ログインのため全件がその事業者のもの。
    const rows = await prisma.reservation.findMany({
      where: { reservationType: "bus" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        date: true,
        eventName: true,
        name: true,
        vehicleType: true,
        hasExtraCar: true,
        price: true,
        status: true,
        slot: true,
        arrivalTime: true,
        cancelToken: true,
        createdAt: true,
      },
    });

    const reservations = rows.map((r) => ({
      ...r,
      // 管理ページ（既存の token 認証）への導線。cancelToken が無ければ null。
      manageUrl: r.cancelToken
        ? `/reservation/manage?token=${encodeURIComponent(r.cancelToken)}`
        : null,
    }));

    return NextResponse.json({ ok: true, reservations });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}
