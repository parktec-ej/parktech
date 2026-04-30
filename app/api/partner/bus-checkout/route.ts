import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { getPartnerSession } from "@/lib/partner-auth";
import {
  getBusReservationFixedPrice,
  getEventDayConfig,
  isReservationOpen,
} from "@/lib/pricing-core";

export const runtime = "nodejs";

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

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanText(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

async function resolvePartnerBusPlace() {
  const slug = String(process.env.PARTNER_BUS_PLACE_SLUG ?? "").trim();

  if (!slug) {
    throw new Error("PARTNER_BUS_PLACE_SLUG is not set");
  }

  return prisma.place.findFirst({
    where: {
      slug,
      isActive: true,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      address: true,
      operationMode: true,
    },
  });
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

export async function POST(req: Request) {
  const session = await getPartnerSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return jsonError("invalid_json", 400, "invalid_json");
    }

    const date = normalizeDate(body.date);
    const busPartnerId = cleanText(body.busPartnerId, 64);
    const plate = cleanText(body.plate, 40);
    const arrivalTime = cleanText(body.arrivalTime, 20);
    const note = cleanText(body.note, 500);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(
        "date は YYYY-MM-DD 形式で指定してください。",
        400,
        "invalid_date"
      );
    }

    if (!busPartnerId) {
      return jsonError("業者を選択してください。", 400, "busPartnerId_required");
    }

    const busPartner = await prisma.busPartner.findFirst({
      where: { id: busPartnerId, isActive: true },
      select: {
        id: true,
        name: true,
        contact: true,
        phone: true,
        email: true,
      },
    });

    if (!busPartner) {
      return jsonError("業者が見つかりません。", 404, "busPartner_not_found");
    }

    const companyName = busPartner.name;
    const contactName = busPartner.contact;
    const phone = busPartner.phone;
    const email = busPartner.email;

    if (!isEmailLike(email)) {
      return jsonError(
        "業者のメールアドレスが不正です。",
        400,
        "email_invalid"
      );
    }

    if (!plate) {
      return jsonError("車両ナンバーは必須です。", 400, "plate_required");
    }

    const place = await resolvePartnerBusPlace();
    if (!place) {
      return jsonError(
        "バス用 place が見つかりません。",
        404,
        "place_not_found"
      );
    }

    const spot = await prisma.spot.findFirst({
      where: {
        placeId: place.id,
        isActive: true,
      },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        label: true,
        placeId: true,
        isActive: true,
        operationModeOverride: true,
      },
    });

    if (!spot) {
      return jsonError(
        "利用可能なバス用 spot が見つかりません。",
        404,
        "spot_not_found"
      );
    }

    const reservationOpen = await isReservationOpen(place.id, date);
    if (!reservationOpen.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "reservation_not_open_yet",
          message: `この日付の予約はまだ開始されていません（${reservationOpen.openDaysBefore}日前から受付）`,
        },
        { status: 409 }
      );
    }

    const eventDay = await getEventDayConfig(place.id, date);
    const eventDayActive = Boolean(eventDay);

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

    const effectiveMode =
      dayMode?.operationMode ??
      spot.operationModeOverride ??
      place.operationMode ??
      "RESERVATION_ONLY";

    if (!canReserve(effectiveMode, eventDayActive)) {
      return jsonError(
        "この日は予約を受け付けていません。",
        409,
        "reservation_not_allowed"
      );
    }

    const existing = await prisma.reservation.findFirst({
      where: {
        placeId: place.id,
        spotId: spot.id,
        date,
      },
      select: {
        id: true,
        paymentRef: true,
        paid: true,
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "already_reserved",
          message: "この日はすでに予約済みです。",
        },
        { status: 409 }
      );
    }

    const price = await getBusReservationFixedPrice(place.id, date);

    if (!Number.isFinite(price) || price <= 0) {
      return jsonError(
        "予約金額の取得に失敗しました。",
        500,
        "invalid_price"
      );
    }

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000"
    ).trim();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email || undefined,
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: {
              name: `${place.name} バス予約 ${date} ${spot.code}`,
            },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/partner/bus-reserve/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/partner/bus-reserve?date=${encodeURIComponent(date)}`,
      metadata: {
        flow: "bus_reservation",
        placeId: place.id,
        spotId: spot.id,
        slot: spot.code,
        date,
        name: contactName,
        plate,
        email,
        price: String(price),

        companyName,
        contactName,
        phone,
        arrivalTime,
        note,
      },
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
    });
  } catch (error: any) {
    console.error("[partner/bus-checkout] error:", error);

    return jsonError(
      String(error?.message ?? "checkout 作成に失敗しました"),
      500,
      "server_error"
    );
  }
}