export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { resolveActivePlace } from "@/lib/place-resolver";
import { calcHourlyFee, getDailyRate, getHourlyRate } from "@/lib/pricing-core";

// 事前決済で選べる時間（分）。1〜6時間と24時間の7択。
// 7時間以降は日額上限に張り付くため、刻む意味がない。
const ALLOWED_MINUTES = [60, 120, 180, 240, 300, 360, 1440];

// 事前決済で買える最大日数。gate-status の MAX_PREPAID_DAYS と揃えること。
const MAX_PREPAID_DAYS = 3;

function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json(
    { ok: false, error: error ?? "bad_request", message },
    { status }
  );
}

function normalizeDate(input: string) {
  const value = String(input ?? "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

function normalizeSlot(input: string) {
  const value = String(input ?? "").trim().toUpperCase();
  if (!value) return "";

  const s = value.match(/^S(\d{1,2})$/i);
  if (s) return `S${String(Number(s[1])).padStart(2, "0")}`;

  const a = value.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;

  return value;
}

function normalizePhone(input: string) {
  return String(input ?? "").replace(/[^\d]/g, "");
}

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
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

type OperationMode =
  | "RESERVATION_ONLY"
  | "HOURLY_ONLY"
  | "RESERVATION_THEN_HOURLY"
  | "EVENT_ONLY"
  | "CLOSED"
  | "MONTHLY";

function canStartHourly(mode: string | null | undefined) {
  return mode === "HOURLY_ONLY" || mode === "RESERVATION_THEN_HOURLY";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError("JSON body が必要です", 400, "invalid_body");
    }

    const inputPlaceId = String(body.placeId ?? "").trim();
    const inputPlaceSlug = String(body.placeSlug ?? "").trim();
    const slot = normalizeSlot(body.slot ?? "");
    const date = normalizeDate(body.date ?? ymdTodayJst());

    const plate = String(body.plate ?? "").trim();
    const phone = normalizePhone(body.phone ?? "");
    const customerName = String(body.customerName ?? "").trim() || null;
    const minutes = Number(body.minutes);

    if (!slot) return jsonError("slot が必要です", 400, "missing_slot");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError("date は YYYY-MM-DD 形式で指定してください", 400, "invalid_date");
    }

    if (!plate) return jsonError("車番が必要です", 400, "missing_plate");
    if (!phone) return jsonError("電話番号が必要です", 400, "missing_phone");

    if (phone.length < 10 || phone.length > 11) {
      return jsonError("電話番号の形式が不正です", 400, "invalid_phone");
    }

    if (!ALLOWED_MINUTES.includes(minutes)) {
      return jsonError("駐車時間の指定が不正です", 400, "invalid_minutes");
    }

    const place = await resolveActivePlace({
      placeId: inputPlaceId,
      placeSlug: inputPlaceSlug,
    });

    if (!place) return jsonError("place が見つかりません", 404, "place_not_found");

    const spot = await prisma.spot.findFirst({
      where: { placeId: place.id, code: slot, isActive: true },
      select: {
        id: true,
        code: true,
        label: true,
        operationModeOverride: true,
      },
    });

    if (!spot) return jsonError("spot が見つかりません", 404, "spot_not_found");

    const dayMode = await prisma.spotModeCalendar.findUnique({
      where: { spotId_date: { spotId: spot.id, date } },
      select: { operationMode: true },
    });

    const effectiveMode =
      (dayMode?.operationMode as OperationMode | undefined) ??
      (spot.operationModeOverride as OperationMode | null) ??
      (place.operationMode as OperationMode | null) ??
      "RESERVATION_ONLY";

    if (effectiveMode === "CLOSED") {
      return jsonError("この区画は本日クローズです", 403, "spot_closed_on_date");
    }

    if (!canStartHourly(effectiveMode)) {
      return jsonError(
        effectiveMode === "EVENT_ONLY"
          ? "この区画はイベント予約専用です。時間貸しは開始できません"
          : "この区画は予約専用です。時間貸しは開始できません",
        403,
        "spot_not_hourly_on_date"
      );
    }

    const activeSession = await prisma.parkingSession.findFirst({
      where: {
        placeId: place.id,
        spotId: spot.id,
        status: { in: ["IN", "PENDING"] },
      },
      select: { id: true },
    });

    if (activeSession) {
      return jsonError("この区画はすでに入庫中です", 409, "session_already_active");
    }

    const reservedToday = await prisma.reservation.findFirst({
      where: {
        placeId: place.id,
        spotId: spot.id,
        date,
        status: "CONFIRMED",
      },
      select: { id: true },
    });

    if (reservedToday) {
      return jsonError(
        "この区画は本日ご予約が入っているため、時間貸しはご利用いただけません",
        409,
        "spot_reserved_on_date"
      );
    }

    // 選んだ時間が上限を超えていないか検証する。
    // 上限は「直近の予約日の午前0時」と「現在 + MAX_PREPAID_DAYS 日」の早いほう。
    const upcomingReservation = await prisma.reservation.findFirst({
      where: {
        placeId: place.id,
        spotId: spot.id,
        date: {
          gte: ymdNextDay(date),
          lte: ymdPlusDays(date, MAX_PREPAID_DAYS),
        },
        status: "CONFIRMED",
      },
      orderBy: { date: "asc" },
      select: { date: true },
    });

    const now = new Date();
    const reservationLimit = upcomingReservation
      ? ymdMidnightJst(upcomingReservation.date)
      : null;
    const maxDaysLimit = new Date(
      now.getTime() + MAX_PREPAID_DAYS * 24 * 60 * 60 * 1000
    );
    const limitAt =
      reservationLimit && reservationLimit.getTime() < maxDaysLimit.getTime()
        ? reservationLimit
        : maxDaysLimit;

    const scheduledEndAt = new Date(now.getTime() + minutes * 60 * 1000);

    if (scheduledEndAt.getTime() > limitAt.getTime()) {
      return jsonError(
        "選択された時間は、この区画のご利用可能時間を超えています",
        409,
        "exceeds_limit"
      );
    }

    const hourlyYen = await getHourlyRate(place.id, date);
    const dailyYen = await getDailyRate(place.id, date);

    if (!hourlyYen || hourlyYen <= 0) {
      return jsonError("時間貸し料金が設定されていません", 500, "no_pricing");
    }

    const totalYen = calcHourlyFee(minutes, hourlyYen, dailyYen);

    if (!Number.isFinite(totalYen) || totalYen <= 0) {
      return jsonError("料金の計算に失敗しました", 500, "price_error");
    }

    // 決済前に PENDING で区画を押さえる。
    // 決済されないまま放置されたものは cron が削除する。
    const session = await prisma.parkingSession.create({
      data: {
        placeId: place.id,
        spotId: spot.id,
        sessionType: "HOURLY",
        plate,
        phone,
        customerName,
        status: "PENDING",
        scheduledEndAt,
        prepaidYen: null,
      },
      select: { id: true },
    });

    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL || "https://reserve.parktec-ej.com"
    ).trim();

    const hours = Math.round(minutes / 60);
    const durationLabel = minutes === 1440 ? "24時間" : `${hours}時間`;

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      success_url: `${baseUrl}/hourly-prepaid/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/gate?placeId=${encodeURIComponent(
        place.slug || place.id
      )}&slot=${encodeURIComponent(spot.code)}&date=${encodeURIComponent(date)}`,
      client_reference_id: `hourly_prepaid:${session.id}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "jpy",
            unit_amount: totalYen,
            product_data: {
              name: `${place.name} ${spot.label ?? spot.code} 時間貸し`,
              description: `${date} / ${spot.label ?? spot.code} / ${durationLabel}`,
            },
          },
        },
      ],
      metadata: {
        flow: "hourly_prepaid",
        parkingSessionId: session.id,
        placeId: place.id,
        placeSlug: place.slug,
        spotId: spot.id,
        slot: spot.code,
        date,
        plate,
        phone,
        customerName: customerName ?? "",
        minutes: String(minutes),
        totalYen: String(totalYen),
        scheduledEndAt: scheduledEndAt.toISOString(),
      },
    });

    if (!checkout.url) {
      // Checkout が作れなかった場合、押さえた区画を解放する
      await prisma.parkingSession.delete({ where: { id: session.id } });
      return jsonError("決済画面の作成に失敗しました", 500, "checkout_error");
    }

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      totalYen,
      minutes,
      scheduledEndAt: scheduledEndAt.toISOString(),
      checkoutUrl: checkout.url,
    });
  } catch (error) {
    console.error("POST /api/hourly-prepaid/start error:", error);
    return jsonError("入庫手続きに失敗しました", 500, "internal_error");
  }
}
