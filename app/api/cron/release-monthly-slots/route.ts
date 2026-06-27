export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackNotification } from "@/lib/slack";
import {
  MONTHLY_PLACE_SLUG,
  MONTHLY_SLOT_CODES,
  MONTHLY_EVENT_DEADLINE_DAYS,
} from "@/lib/monthly-config";

function ymdJst(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// 当日(JST)から「ちょうど N 日後」の YYYY-MM-DD（JST基準）。
function ymdPlusDaysJst(days: number): string {
  const todayJst = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
  const [y, m, d] = todayJst.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

// 月極4区画(A-17〜A-20)を「イベント日の MONTHLY_EVENT_DEADLINE_DAYS 日前(=締切)に
// 到達し、かつ契約者のピン留め予約が無い」とき、一般予約へ自動開放する。
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
      select: { id: true },
    });
    if (!place) {
      return NextResponse.json(
        { ok: false, error: "place_not_found" },
        { status: 404 }
      );
    }

    const spots = await prisma.spot.findMany({
      where: {
        placeId: place.id,
        isActive: true,
        code: { in: [...MONTHLY_SLOT_CODES] },
      },
      select: { id: true, code: true },
    });
    if (spots.length === 0) {
      return NextResponse.json({ ok: true, skipped: "no_monthly_spots" });
    }

    const todayJst = ymdJst(new Date());
    const todayStart = new Date(`${todayJst}T00:00:00+09:00`);
    const deadlineYmd = ymdPlusDaysJst(MONTHLY_EVENT_DEADLINE_DAYS);

    const eventDays = await prisma.eventDay.findMany({
      where: { placeId: place.id, isActive: true, date: { gte: todayStart } },
      orderBy: { date: "asc" },
      take: 100,
      select: { id: true, date: true },
    });

    const released: string[] = [];
    const noResponse: string[] = [];

    for (const ev of eventDays) {
      const ymd = ymdJst(ev.date);

      // まだ締切(イベントのN日前)に未到達なら、契約者の優先確保期間なのでスキップ
      if (ymd > deadlineYmd) continue;

      for (const spot of spots) {
        // 既に開放済みマーカーがあれば冪等スキップ
        const existing = await prisma.spotModeCalendar.findUnique({
          where: { spotId_date: { spotId: spot.id, date: ymd } },
          select: { operationMode: true },
        });
        if (existing?.operationMode === "RESERVATION_ONLY") continue;

        // その区画に CONFIRMED 予約があれば（契約者がピン留め予約済み等）保持
        const taken = await prisma.reservation.findFirst({
          where: { spotId: spot.id, date: ymd, status: "CONFIRMED" },
          select: { id: true },
        });
        if (taken) continue;

        // 締切到達・未予約 → 一般予約へ開放
        await prisma.spotModeCalendar.upsert({
          where: { spotId_date: { spotId: spot.id, date: ymd } },
          update: { operationMode: "RESERVATION_ONLY" },
          create: {
            placeId: place.id,
            spotId: spot.id,
            date: ymd,
            operationMode: "RESERVATION_ONLY",
          },
        });
        released.push(`${ymd} ${spot.code}`);

        // プラン2契約者が未回答(NOTIFIED)のまま締切なら EXPIRED 化し記録
        const contract = await prisma.monthlyContract.findFirst({
          where: {
            placeId: place.id,
            spotId: spot.id,
            status: "ACTIVE",
            plan: "INCLUDES_EVENT",
          },
          select: { id: true, tenant: { select: { name: true } } },
        });
        if (contract) {
          const meRow = await prisma.monthlyEventResponse.findUnique({
            where: { contractId_date: { contractId: contract.id, date: ymd } },
            select: { id: true, status: true },
          });
          if (meRow && meRow.status === "NOTIFIED") {
            await prisma.monthlyEventResponse.update({
              where: { id: meRow.id },
              data: { status: "EXPIRED" },
            });
            noResponse.push(
              `${ymd} ${spot.code}（${contract.tenant?.name ?? "契約者"}）`
            );
          }
        }
      }
    }

    if (released.length > 0) {
      await sendSlackNotification(
        `【月極区画 自動開放】イベント${MONTHLY_EVENT_DEADLINE_DAYS}日前の締切に到達し未予約だった区画を一般予約へ開放しました：\n${released.join(
          "\n"
        )}`
      );
    }
    if (noResponse.length > 0) {
      await sendSlackNotification(
        `【月極・未回答】プラン2契約者が${MONTHLY_EVENT_DEADLINE_DAYS}日前までに回答せず締切。未回答のまま開放した区画：\n${noResponse.join(
          "\n"
        )}`
      );
    }

    return NextResponse.json({
      ok: true,
      deadlineYmd,
      releasedCount: released.length,
      released,
    });
  } catch (error) {
    console.error("[cron/release-monthly-slots] error:", error);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}
