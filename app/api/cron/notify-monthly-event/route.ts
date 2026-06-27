export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMonthlyEventNoticeMail } from "@/lib/mail";
import { signEventToken } from "@/lib/event-token";
import {
  MONTHLY_PLACE_SLUG,
  MONTHLY_EVENT_DEADLINE_DAYS,
} from "@/lib/monthly-config";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://reserve.parktec-ej.com"
).trim();

const NOTIFY_WINDOW_DAYS = 30; // 1ヶ月前から通知

function ymdJst(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}
function ymdPlusDaysJst(days: number): string {
  const todayJst = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
  const [y, m, d] = todayJst.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
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

  try {
    const place = await prisma.place.findFirst({
      where: { slug: MONTHLY_PLACE_SLUG, isActive: true },
      select: { id: true, name: true },
    });
    if (!place) {
      return NextResponse.json(
        { ok: false, error: "place_not_found" },
        { status: 404 }
      );
    }

    const contracts = await prisma.monthlyContract.findMany({
      where: {
        placeId: place.id,
        status: "ACTIVE",
        plan: "INCLUDES_EVENT",
        spotId: { not: null },
      },
      include: { tenant: true },
    });
    if (contracts.length === 0) {
      return NextResponse.json({ ok: true, notified: 0 });
    }

    const deadlineYmd = ymdPlusDaysJst(MONTHLY_EVENT_DEADLINE_DAYS); // 14日後
    const windowEndYmd = ymdPlusDaysJst(NOTIFY_WINDOW_DAYS); // 30日後
    const todayStart = new Date(`${ymdJst(new Date())}T00:00:00+09:00`);

    const eventDays = await prisma.eventDay.findMany({
      where: { placeId: place.id, isActive: true, date: { gte: todayStart } },
      orderBy: { date: "asc" },
      take: 100,
      select: { id: true, date: true, label: true },
    });

    const dashboardUrl = `${APP_URL}/tenant/dashboard`;
    let notified = 0;

    for (const ev of eventDays) {
      const ymd = ymdJst(ev.date);
      // 通知窓は「締切(14日前)〜30日前」。締切超過・30日より先はスキップ。
      if (ymd < deadlineYmd) continue;
      if (ymd > windowEndYmd) continue;

      const eventName =
        ev.label && ev.label.trim() ? ev.label.trim() : `${ymd} のイベント`;

      for (const c of contracts) {
        const existing = await prisma.monthlyEventResponse.findUnique({
          where: { contractId_date: { contractId: c.id, date: ymd } },
          select: { id: true },
        });
        if (existing) continue;

        await prisma.monthlyEventResponse.create({
          data: {
            contractId: c.id,
            placeId: place.id,
            spotId: c.spotId as string,
            date: ymd,
            status: "NOTIFIED",
          },
        });

        const reserveToken = signEventToken({ c: c.id, d: ymd, a: "reserve" });
        const declineToken = signEventToken({ c: c.id, d: ymd, a: "decline" });

        await sendMonthlyEventNoticeMail({
          to: c.tenant.email,
          placeName: place.name,
          eventName,
          date: ymd,
          reserveUrl: `${APP_URL}/api/tenant/event-response/reserve?token=${encodeURIComponent(
            reserveToken
          )}`,
          declineUrl: `${APP_URL}/api/tenant/event-response/decline?token=${encodeURIComponent(
            declineToken
          )}`,
          dashboardUrl,
          deadlineNote: `イベント${MONTHLY_EVENT_DEADLINE_DAYS}日前まで`,
        }).catch((e) =>
          console.error("[notify-monthly-event] mail error:", e)
        );

        notified++;
      }
    }

    return NextResponse.json({ ok: true, notified });
  } catch (error) {
    console.error("[cron/notify-monthly-event] error:", error);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}
