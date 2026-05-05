export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackAlert } from "@/lib/slack";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function endOfReservationDateUtc(ymd: string): Date {
  // End of reservation = next-day midnight in JST.
  const startJst = new Date(`${ymd}T00:00:00+09:00`);
  return new Date(startJst.getTime() + 24 * 60 * 60 * 1000);
}

export async function GET(req: Request) {
  // Optional auth: if CRON_SECRET is set, require it as a Bearer token.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }
  }

  const now = new Date();

  const candidates = await prisma.reservation.findMany({
    where: {
      checkedIn: true,
      checkedOutAt: null,
      status: "CONFIRMED",
    },
    select: {
      id: true,
      date: true,
      slot: true,
      name: true,
      phone: true,
      place: { select: { name: true } },
      spot: { select: { label: true, code: true } },
    },
  });

  const alerted: string[] = [];

  for (const r of candidates) {
    const reservationEndUtc = endOfReservationDateUtc(r.date);
    const elapsedMs = now.getTime() - reservationEndUtc.getTime();

    if (elapsedMs < TWO_HOURS_MS) continue;

    const hours = Math.floor(elapsedMs / (60 * 60 * 1000));

    await sendSlackAlert(
      [
        "⚠️ アラート 未出庫",
        `駐車場：${r.place?.name ?? "-"}`,
        `スポット：${r.spot?.label ?? r.spot?.code ?? r.slot}`,
        `顧客：${r.name}`,
        `電話：${r.phone ?? "未登録"}`,
        `予約終了から${hours}時間経過`,
      ].join("\n")
    );

    alerted.push(r.id);
  }

  return NextResponse.json({
    ok: true,
    checked: candidates.length,
    alerted: alerted.length,
    alertedIds: alerted,
  });
}
