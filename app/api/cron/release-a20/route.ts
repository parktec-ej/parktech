export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSlackNotification } from "@/lib/slack";
import { ymdToUtcDate } from "@/lib/pricing-core";

// 当日（JST）から「ちょうど N 日後」の YYYY-MM-DD を JST 基準で返す。
// JST の暦日に対して UTC 日付演算を行うことで、タイムゾーンずれを避ける。
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
  // 既存 cron と同じく、CRON_SECRET があれば Bearer 認証を要求
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
    const slug = String(process.env.PARTNER_BUS_PLACE_SLUG ?? "").trim();
    if (!slug) {
      return NextResponse.json(
        { ok: false, error: "PARTNER_BUS_PLACE_SLUG_not_set" },
        { status: 500 }
      );
    }

    const busPlace = await prisma.place.findFirst({
      where: { slug, isActive: true },
      select: { id: true, name: true },
    });

    if (!busPlace) {
      return NextResponse.json(
        { ok: false, error: "bus_place_not_found" },
        { status: 404 }
      );
    }

    // 「ちょうど2週間後」の単日判定（JST 基準の YYYY-MM-DD）
    const targetYmd = ymdPlusDaysJst(14);

    // その日がイベント日でなければ何もしない
    const eventDay = await prisma.eventDay.findFirst({
      where: {
        placeId: busPlace.id,
        date: ymdToUtcDate(targetYmd),
        isActive: true,
      },
      select: { id: true, label: true },
    });

    if (!eventDay) {
      return NextResponse.json({
        ok: true,
        targetDate: targetYmd,
        skipped: "not_event_day",
      });
    }

    // A-20 区画
    const a20 = await prisma.spot.findFirst({
      where: { placeId: busPlace.id, code: "A-20", isActive: true },
      select: { id: true },
    });

    if (!a20) {
      return NextResponse.json({
        ok: true,
        targetDate: targetYmd,
        skipped: "a20_spot_not_found",
      });
    }

    // 当日に A-20 を使う「バス＋追加普通車」予約があるか
    const a20BusUse = await prisma.reservation.findFirst({
      where: {
        placeId: busPlace.id,
        date: targetYmd,
        spotId: a20.id,
        reservationType: "bus",
        hasExtraCar: true,
        status: { not: "CANCELED" },
      },
      select: { id: true },
    });

    if (a20BusUse) {
      return NextResponse.json({
        ok: true,
        targetDate: targetYmd,
        notified: false,
        reason: "a20_in_use_by_bus",
      });
    }

    // 追加普通車のバス予約が無い → A-20 を一般開放できる旨を通知（自動開放はしない）
    await sendSlackNotification(
      `【A-20解放のお知らせ】${targetYmd} のイベントで追加普通車のバス予約がありません。A-20を一般予約に開放できます。`
    );

    return NextResponse.json({
      ok: true,
      targetDate: targetYmd,
      notified: true,
    });
  } catch (error) {
    console.error("[cron/release-a20] error:", error);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}
