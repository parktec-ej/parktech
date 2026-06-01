export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePartner } from "@/lib/partner-auth";
import {
  getBusReservationFixedPrice,
  getEventDayConfig,
  isReservationOpen,
  ymdToUtcDate,
} from "@/lib/pricing-core";

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

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

async function resolvePartnerBusPlace() {
  const slug = String(process.env.PARTNER_BUS_PLACE_SLUG ?? "").trim();

  if (!slug) {
    throw new Error("PARTNER_BUS_PLACE_SLUG is not set");
  }

  const place = await prisma.place.findFirst({
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

  return place;
}

export async function GET(req: NextRequest) {
  try {
    await requirePartner();

    const url = new URL(req.url);

    const date = normalizeDate(
      url.searchParams.get("date") || ymdTodayJst()
    );

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(
        "date は YYYY-MM-DD 形式で指定してください",
        400,
        "invalid_date"
      );
    }

    const place = await resolvePartnerBusPlace();

    if (!place) {
      return jsonError(
        "バス用 place が見つかりません",
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
        operationModeOverride: true,
      },
    });

    if (!spot) {
      return jsonError(
        "利用可能なバス用 spot が見つかりません",
        404,
        "spot_not_found"
      );
    }

    const reservationOpen = await isReservationOpen(place.id, date);
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

    const existing = await prisma.reservation.findFirst({
      where: {
        placeId: place.id,
        spotId: spot.id,
        date,
      },
      select: {
        id: true,
        date: true,
        slot: true,
        name: true,
        plate: true,
        email: true,
        price: true,
        paid: true,
        paymentRef: true,
        createdAt: true,
      },
    });

    const price = await getBusReservationFixedPrice(place.id, date);

    // バスは受付窓（rifu-main-bus の EventDay の reservationOpenDaysBefore）に
    // 依存させず「常に開放」。過去日（JST）のみ不可。これにより rifu-main-bus の
    // EventDay 設定に関わらず、一般の30日窓より前でもバスは予約可能。
    // date / todayJst はともに "YYYY-MM-DD"(Asia/Tokyo) なので文字列比較で日付比較が成立。
    // BUS_LANE は spotId=null で複数台を許容するため、existing による一律ブロックは行わない。
    const available = date >= ymdTodayJst();

    return NextResponse.json({
      ok: true,
      place,
      date,
      eventDayActive,
      reservationOpen,
      effectiveMode,
      spot: {
        id: spot.id,
        code: spot.code,
        label: spot.label,
      },
      price,
      available,
      eventDay: eventDay
        ? {
            id: eventDay.id,
            label: eventDay.label,
            fixedYenOverride: eventDay.fixedYenOverride,
            hourlyYenOverride: eventDay.hourlyYenOverride,
            busFixedYen: eventDay.busFixedYen,
            reservationOpenDaysBefore:
              eventDay.reservationOpenDaysBefore,
          }
        : null,
      existingReservation: existing ?? null,
    });
  } catch (error: any) {
    console.error("[partner/bus-availability] error:", error);

    return jsonError(
      String(error?.message ?? "空き状況取得に失敗しました"),
      500,
      "server_error"
    );
  }
}