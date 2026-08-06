export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getDailyRate, getHourlyRate } from "@/lib/pricing-core";
import { calcOverstayPenalty } from "@/lib/settlement-math";

// gate-status / start / extend と揃えること。
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
    if (!sessionId) {
      return jsonError("sessionId が必要です", 400, "missing_session_id");
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
        spot: { select: { code: true, label: true } },
        place: { select: { id: true, slug: true, name: true } },
      },
    });

    if (!session) {
      return jsonError("セッションが見つかりません", 404, "session_not_found");
    }

    if (session.status !== "IN" || session.checkOutAt) {
      return jsonError("ご利用中のセッションではありません", 409, "not_active");
    }

    if (session.prepaidYen == null || !session.scheduledEndAt) {
      return jsonError("このセッションは対象外です", 409, "not_prepaid");
    }

    const now = new Date();

    if (now.getTime() <= session.scheduledEndAt.getTime()) {
      return jsonError(
        "出庫期限内です。通常の出庫手続きをご利用ください",
        409,
        "not_overstay"
      );
    }

    // 後続予約日の午前0時を求める。対応費用5,000円の発生条件。
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

    const reservationLimitAt = upcomingReservation
      ? ymdMidnightJst(upcomingReservation.date)
      : null;

    const date = ymdJst(now);
    const hourlyYen = await getHourlyRate(session.placeId, date);
    const dailyYen = await getDailyRate(session.placeId, date);

    if (!hourlyYen || hourlyYen <= 0) {
      return jsonError("時間貸し料金が設定されていません", 500, "no_pricing");
    }

    // 返金相当額は自動請求に含めない（案B）。
    // 予約者への返金は超過発生後に手動で行うため、出庫時点では確定しない。
    // 返金が発生した場合は規約 第6条の2 に基づき別途請求する。
    const penalty = calcOverstayPenalty({
      scheduledEndAt: session.scheduledEndAt,
      exitAt: now,
      hourlyYen,
      dailyYen,
      reservationLimitAt,
      refundAmount: 0,
    });

    if (!penalty.isOverstay || penalty.total <= 0) {
      return jsonError("超過料金がありません", 409, "no_penalty");
    }

    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL || "https://reserve.parktec-ej.com"
    ).trim();

    const gateBack = `${baseUrl}/gate?placeId=${encodeURIComponent(
      session.place?.slug ?? session.placeId
    )}&slot=${encodeURIComponent(session.spot?.code ?? "")}`;

    const descParts = [`超過 ${penalty.overstayMinutes}分`];
    if (penalty.responseFee > 0) {
      descParts.push("対応費用");
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${baseUrl}/hourly-prepaid/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: gateBack,
      client_reference_id: `hourly_overstay:${session.id}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "jpy",
            unit_amount: penalty.total,
            product_data: {
              name: `${session.place?.name ?? ""} ${
                session.spot?.label ?? session.spot?.code ?? ""
              } 時間貸し超過料金`,
              description: descParts.join(" / "),
            },
          },
        },
      ],
      metadata: {
        flow: "hourly_overstay",
        parkingSessionId: session.id,
        placeId: session.placeId,
        spotId: session.spotId,
        slot: session.spot?.code ?? "",
        overstayMinutes: String(penalty.overstayMinutes),
        hourlyFee: String(penalty.hourlyFee),
        responseFee: String(penalty.responseFee),
        totalYen: String(penalty.total),
      },
    });

    if (!checkout.url) {
      return jsonError("決済画面の作成に失敗しました", 500, "checkout_error");
    }

    return NextResponse.json({
      ok: true,
      overstayMinutes: penalty.overstayMinutes,
      hourlyFee: penalty.hourlyFee,
      responseFee: penalty.responseFee,
      totalYen: penalty.total,
      exceededReservationLimit: penalty.exceededReservationLimit,
      checkoutUrl: checkout.url,
    });
  } catch (error) {
    console.error("POST /api/hourly-prepaid/overstay error:", error);
    return jsonError("超過精算の手続きに失敗しました", 500, "internal_error");
  }
}
