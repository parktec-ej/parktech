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
    // A-20 は一般lot「rifu-main」の区画。開放対象も rifu-main なので、
    // イベント日判定・A-20 spot ともに rifu-main を基準にする。
    const generalPlace = await prisma.place.findFirst({
      where: { slug: "rifu-main", isActive: true },
      select: { id: true, name: true },
    });

    if (!generalPlace) {
      return NextResponse.json(
        { ok: false, error: "general_place_not_found" },
        { status: 404 }
      );
    }

    // 「ちょうど2週間後」の単日判定（JST 基準の YYYY-MM-DD）
    const targetYmd = ymdPlusDaysJst(14);

    // その日が rifu-main のイベント日でなければ何もしない
    const eventDay = await prisma.eventDay.findFirst({
      where: {
        placeId: generalPlace.id,
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

    // A-20 区画（rifu-main）
    const a20 = await prisma.spot.findFirst({
      where: { placeId: generalPlace.id, code: "A-20", isActive: true },
      select: { id: true },
    });

    if (!a20) {
      return NextResponse.json({
        ok: true,
        targetDate: targetYmd,
        skipped: "a20_spot_not_found",
      });
    }

    // 既に開放済み（RESERVATION_ONLY マーカーあり）なら何もしない＝冪等。
    // upsert も通知もスキップ（開放済みの日に毎日通知が出るのを防ぐ）。
    const existingMode = await prisma.spotModeCalendar.findUnique({
      where: { spotId_date: { spotId: a20.id, date: targetYmd } },
      select: { operationMode: true },
    });

    if (existingMode?.operationMode === "RESERVATION_ONLY") {
      return NextResponse.json({
        ok: true,
        targetDate: targetYmd,
        skipped: "already_released",
      });
    }

    // 当日に A-20 を使う「バス＋追加普通車」予約があるか。
    // 予約自身の placeId は rifu-main-bus（クロスplace）なので placeId は条件に
    // 入れず、spotId 単独で判定する。
    const a20BusUse = await prisma.reservation.findFirst({
      where: {
        spotId: a20.id,
        date: targetYmd,
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

    // 追加普通車のバス予約が無い → A-20 を一般予約へ自動開放（SpotModeCalendar に
    // RESERVATION_ONLY を upsert）。マーカーが付くと、availability/checkout が
    // この日だけ A-20 を表示・予約可とし、bus-checkout はこの日の A-20 を拒否する。
    await prisma.spotModeCalendar.upsert({
      where: { spotId_date: { spotId: a20.id, date: targetYmd } },
      update: { operationMode: "RESERVATION_ONLY" },
      create: {
        placeId: generalPlace.id,
        spotId: a20.id,
        date: targetYmd,
        operationMode: "RESERVATION_ONLY",
      },
    });

    // 初回開放時のみ通知（既存マーカーは上で弾いているのでここは初回のみ）
    await sendSlackNotification(
      `【A-20自動開放】${targetYmd} のイベントで追加普通車のバス予約がないため、A-20を一般予約に開放しました。`
    );

    return NextResponse.json({
      ok: true,
      targetDate: targetYmd,
      released: true,
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
