export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { calcHourlyFee, getDailyRate, getHourlyRate } from "@/lib/pricing-core";

// 入庫時と同じ7択。app/api/hourly-prepaid/start と揃えること。
const ALLOWED_MINUTES = [60, 120, 180, 240, 300, 360, 1440];

// 事前決済で買える最大日数。gate-status / start と揃えること。
const MAX_PREPAID_DAYS = 3;

function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json(
    { ok: false, error: error ?? "bad_request", message },
    { status }
  );
}

function ymdJst(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function ymdNextDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

function ymdPlusDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function ymdMidnightJst(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, -9, 0, 0));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError("JSON body が必要です", 400, "invalid_body");
    }

    const sessionId = String(body.sessionId ?? "").trim();
    const minutes = Number(body.minutes);

    if (!sessionId) {
      return jsonError("sessionId が必要です", 400, "missing_session_id");
    }

    if (!ALLOWED_MINUTES.includes(minutes)) {
      return jsonError("延長時間の指定が不正です", 400, "invalid_minutes");
    }

    const session = await prisma.parkingSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        placeId: true,
        spotId: true,
        status: true,
        checkOutAt: true,
        checkInAt: true,
        scheduledEndAt: true,
        prepaidYen: true,
        plate: true,
        spot: { select: { code: true, label: true } },
        place: { select: { id: true, slug: true, name: true } },
      },
    });

    if (!session) {
      return jsonError("セッションが見つかりません", 404, "session_not_found");
    }

    if (session.status !== "IN" || session.checkOutAt) {
      return jsonError(
        "ご利用中のセッションではありません",
        409,
        "not_active"
      );
    }

    if (session.prepaidYen == null || !session.scheduledEndAt) {
      return jsonError(
        "このセッションは延長できません",
        409,
        "not_prepaid"
      );
    }

    // 延長の起点は現在時刻ではなく既存の出庫期限。
    // 買った時間が目減りしないようにする。
    const currentEnd = session.scheduledEndAt;
    const newEnd = new Date(currentEnd.getTime() + minutes * 60 * 1000);

    // 上限の再計算。
    // 予約による上限は「入庫日の翌日〜MAX_PREPAID_DAYS 日先で最も近い予約日の午前0時」。
    // 最大日数による上限は「入庫時刻 + MAX_PREPAID_DAYS 日」。
    const baseYmd = ymdJst(session.checkInAt);

    const upcomingReservation = await prisma.reservation.findFirst({
      where: {
        placeId: session.placeId,
        spotId: session.spotId,
        date: {
          gte: ymdNextDay(baseYmd),
          lte: ymdPlusDays(baseYmd, MAX_PREPAID_DAYS),
        },
        status: "CONFIRMED",
      },
      orderBy: { date: "asc" },
      select: { date: true },
    });

    const reservationLimit = upcomingReservation
      ? ymdMidnightJst(upcomingReservation.date)
      : null;

    const maxDaysLimit = new Date(
      session.checkInAt.getTime() + MAX_PREPAID_DAYS * 24 * 60 * 60 * 1000
    );

    const limitAt =
      reservationLimit && reservationLimit.getTime() < maxDaysLimit.getTime()
        ? reservationLimit
        : maxDaysLimit;

    if (newEnd.getTime() > limitAt.getTime()) {
      return NextResponse.json(
        {
          ok: false,
          error: "exceeds_limit",
          message: "その時間までは延長できません",
          limitAt: limitAt.toISOString(),
        },
        { status: 409 }
      );
    }

    const date = ymdJst(new Date());
    const hourlyYen = await getHourlyRate(session.placeId, date);
    const dailyYen = await getDailyRate(session.placeId, date);

    if (!hourlyYen || hourlyYen <= 0) {
      return jsonError("時間貸し料金が設定されていません", 500, "no_pricing");
    }

    const totalYen = calcHourlyFee(minutes, hourlyYen, dailyYen);

    if (!Number.isFinite(totalYen) || totalYen <= 0) {
      return jsonError("料金の計算に失敗しました", 500, "price_error");
    }

    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL || "https://reserve.parktec-ej.com"
    ).trim();

    const gateBack = `${baseUrl}/gate?placeId=${encodeURIComponent(
      session.place?.slug ?? session.placeId
    )}&slot=${encodeURIComponent(session.spot?.code ?? "")}`;

    const hours = Math.round(minutes / 60);
    const durationLabel = minutes === 1440 ? "24時間" : `${hours}時間`;

    const checkout = await stripe.checkout.sessions.create({
      // payment_method_types は指定しない（start と同じ理由）。
      mode: "payment",
      success_url: `${baseUrl}/hourly-prepaid/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: gateBack,
      client_reference_id: `hourly_extend:${session.id}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "jpy",
            unit_amount: totalYen,
            product_data: {
              name: `${session.place?.name ?? ""} ${
                session.spot?.label ?? session.spot?.code ?? ""
              } 時間貸し延長`,
              description: `${durationLabel}の延長`,
            },
          },
        },
      ],
      metadata: {
        flow: "hourly_extend",
        parkingSessionId: session.id,
        placeId: session.placeId,
        spotId: session.spotId,
        slot: session.spot?.code ?? "",
        minutes: String(minutes),
        totalYen: String(totalYen),
        newScheduledEndAt: newEnd.toISOString(),
      },
    });

    if (!checkout.url) {
      return jsonError("決済画面の作成に失敗しました", 500, "checkout_error");
    }

    return NextResponse.json({
      ok: true,
      totalYen,
      minutes,
      newScheduledEndAt: newEnd.toISOString(),
      checkoutUrl: checkout.url,
    });
  } catch (error) {
    console.error("POST /api/hourly-prepaid/extend error:", error);
    return jsonError("延長手続きに失敗しました", 500, "internal_error");
  }
}
