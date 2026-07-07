import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { resolveActivePlace } from "@/lib/place-resolver";
import {
  getReservationFixedPrice,
  isReservationOpen,
  ymdToUtcDate,
} from "@/lib/pricing-core";
import {
  MONTHLY_PLACE_SLUG,
  MONTHLY_SLOT_CODES,
  OCCUPYING_STATUSES,
} from "@/lib/monthly-config";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json(
    {
      ok: false,
      error: error ?? "bad_request",
      message,
    },
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

async function isActiveEventDay(placeId: string, date: string) {
  const targetDate = ymdToUtcDate(date);

  const row = await prisma.eventDay.findFirst({
    where: {
      placeId,
      date: targetDate,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  return Boolean(row);
}

function canReserve(
  mode: string | null | undefined,
  eventDayActive: boolean
) {
  if (mode === "RESERVATION_ONLY") return true;
  if (mode === "RESERVATION_THEN_HOURLY") return true;
  if (mode === "EVENT_ONLY") return eventDayActive;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const placeIdInput = String(body?.placeId ?? "").trim();
    const placeSlugInput = String(body?.placeSlug ?? "").trim();
    const spotId = String(body?.spotId ?? "").trim();

    const date = normalizeDate(body?.date ?? "");
    const name = String(body?.name ?? "").trim();
    const plate = String(body?.plate ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const phone = String(body?.phone ?? "").trim();

    if (phone && !/^[0-9\-\s\+\(\)]+$/.test(phone)) {
      return jsonError(
        "電話番号の形式が正しくありません",
        400,
        "invalid_phone"
      );
    }

    if (!spotId) {
      return jsonError("spotId が必要です", 400, "missing_spot_id");
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(
        "date は YYYY-MM-DD 形式で指定してください",
        400,
        "invalid_date"
      );
    }

    if (!name) {
      return jsonError("氏名が必要です", 400, "missing_name");
    }

    if (!plate) {
      return jsonError("車両ナンバーが必要です", 400, "missing_plate");
    }

    if (!email) {
      return jsonError("メールアドレスが必要です", 400, "missing_email");
    }

    const place = await resolveActivePlace({
      placeId: placeIdInput,
      placeSlug: placeSlugInput,
    });

    if (!place) {
      return jsonError("place が見つかりません", 404, "place_not_found");
    }

    const reservationOpen = await isReservationOpen(place.id, date);

    if (!reservationOpen.ok) {
      return jsonError("まだ予約開始前です", 409, "not_open_yet");
    }

    const spot = await prisma.spot.findFirst({
      where: {
        id: spotId,
        placeId: place.id,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        label: true,
        operationModeOverride: true,
      },
    });

    if (!spot) {
      return jsonError("spot が見つかりません", 404, "spot_not_found");
    }

    // 月極4区画(A-17〜A-20)は有効な月極契約があれば契約者専有のため決済を拒否。
    // 契約が無ければ一般枠として通過（decline由来の残マーカーには依存しない）。
    if (
      place.slug === MONTHLY_PLACE_SLUG &&
      (MONTHLY_SLOT_CODES as readonly string[]).includes(spot.code)
    ) {
      const occupying = await prisma.monthlyContract.findFirst({
        where: { spotId: spot.id, status: { in: [...OCCUPYING_STATUSES] } },
        select: { id: true },
      });
      if (occupying) {
        return jsonError(
          "この区画は月極契約者専有のため予約できません",
          409,
          "spot_not_reservable"
        );
      }
    }

    const dayMode = await prisma.spotModeCalendar.findUnique({
      where: {
        spotId_date: {
          spotId: spot.id,
          date,
        },
      },
      select: {
        operationMode: true,
      },
    });

    const eventDayActive = await isActiveEventDay(place.id, date);

    const effectiveMode =
      dayMode?.operationMode ??
      spot.operationModeOverride ??
      place.operationMode ??
      "RESERVATION_ONLY";

    if (!canReserve(effectiveMode, eventDayActive)) {
      return jsonError(
        effectiveMode === "EVENT_ONLY"
          ? "イベント日以外は予約できません"
          : "この区画は予約不可です",
        409,
        "not_reservable"
      );
    }

    // ここが重要:
    // キャンセル済みは除外し、CONFIRMED のみ予約済み扱いにする
    const existing = await prisma.reservation.findFirst({
      where: {
        placeId: place.id,
        spotId: spot.id,
        date,
        status: "CONFIRMED",
      },
      select: { id: true },
    });

    if (existing) {
      return jsonError(
        "その区画はすでに予約済みです。",
        409,
        "already_reserved"
      );
    }

    const price = await getReservationFixedPrice(place.id, date);

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    ).trim();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: {
              name: `${place.name} ${spot.label ?? spot.code} 予約`,
              description: `${date} / ${spot.label ?? spot.code}`,
            },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/reserve/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/reserve/cancel`,
      metadata: {
        flow: "reservation",
        placeId: place.id,
        spotId: spot.id,
        slot: spot.code,
        date,
        name,
        plate,
        email,
        phone,
        price: String(price),
      },
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error(error);

    return jsonError(
      "Stripe Checkout の作成に失敗しました",
      500,
      "server_error"
    );
  }
}
