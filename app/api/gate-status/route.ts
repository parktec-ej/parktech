import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function ymdTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function normalizeSlot(input: string): string {
  if (!input) return input.trim();

  const v = input.trim().toUpperCase();

  const s = v.match(/^S(\d{1,2})$/i);
  if (s) return `S${String(Number(s[1])).padStart(2, "0")}`;

  const a = v.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;

  return v;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const rawSlot = url.searchParams.get("slot");
    const date = url.searchParams.get("date") ?? ymdTodayJst();
    const placeId = url.searchParams.get("placeId");

    if (!rawSlot) {
      return NextResponse.json({ ok: false, error: "slot_required" }, { status: 400 });
    }

    if (!placeId) {
      return NextResponse.json({ ok: false, error: "placeId_required" }, { status: 400 });
    }

    const slot = normalizeSlot(rawSlot);

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        name: true,
        operationMode: true,
        isActive: true,
      },
    });

    if (!place || !place.isActive) {
      return NextResponse.json({ ok: false, error: "place_not_found" }, { status: 404 });
    }

    const spot = await prisma.spot.findFirst({
      where: {
        placeId,
        code: slot,
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
      return NextResponse.json(
        { ok: false, error: "spot_not_found", slot, date, placeId },
        { status: 404 }
      );
    }

    const effectiveOperationMode =
      spot.operationModeOverride ?? place.operationMode;

    const reservation = await prisma.reservation.findFirst({
      where: {
        date,
        placeId,
        spotId: spot.id,
      },
      select: {
        id: true,
        paid: true,
        checkedIn: true,
        checkedInAt: true,
        checkedOutAt: true,
        placeId: true,
        spotId: true,
      },
    });

    const basePayload = {
      ok: true,
      effectiveOperationMode,
      placeOperationMode: place.operationMode,
      spotOperationModeOverride: spot.operationModeOverride,
      slot,
      date,
      placeId,
      spotId: spot.id,
    };

    if (effectiveOperationMode === "CLOSED") {
      const openHourly = await prisma.parkingSession.findFirst({
        where: {
          placeId,
          spotId: spot.id,
          sessionType: "HOURLY",
          status: "IN",
          checkOutAt: null,
        },
        orderBy: { checkInAt: "desc" },
        select: {
          id: true,
          checkInAt: true,
        },
      });

      if (reservation && reservation.checkedIn && !reservation.checkedOutAt) {
        return NextResponse.json({
          ...basePayload,
          mode: "can_checkout",
          reservationId: reservation.id,
          checkedInAt: reservation.checkedInAt,
        });
      }

      if (openHourly) {
        return NextResponse.json({
          ...basePayload,
          mode: "can_checkout_hourly",
          sessionId: openHourly.id,
          checkedInAt: openHourly.checkInAt,
        });
      }

      return NextResponse.json({
        ...basePayload,
        mode: "closed",
      });
    }

    if (effectiveOperationMode === "RESERVATION_ONLY") {
      if (!reservation) {
        return NextResponse.json({
          ...basePayload,
          mode: "no_reservation",
        });
      }

      if (!reservation.paid) {
        return NextResponse.json({
          ...basePayload,
          mode: "unpaid",
          reservationId: reservation.id,
        });
      }

      if (!reservation.checkedIn) {
        return NextResponse.json({
          ...basePayload,
          mode: "need_pin_checkin",
          reservationId: reservation.id,
        });
      }

      if (!reservation.checkedOutAt) {
        return NextResponse.json({
          ...basePayload,
          mode: "can_checkout",
          reservationId: reservation.id,
          checkedInAt: reservation.checkedInAt,
        });
      }

      return NextResponse.json({
        ...basePayload,
        mode: "already_checked_out",
        reservationId: reservation.id,
      });
    }

    if (effectiveOperationMode === "HOURLY_ONLY") {
      const openHourly = await prisma.parkingSession.findFirst({
        where: {
          placeId,
          spotId: spot.id,
          sessionType: "HOURLY",
          status: "IN",
          checkOutAt: null,
        },
        orderBy: { checkInAt: "desc" },
        select: {
          id: true,
          checkInAt: true,
        },
      });

      if (openHourly) {
        return NextResponse.json({
          ...basePayload,
          mode: "can_checkout_hourly",
          sessionId: openHourly.id,
          checkedInAt: openHourly.checkInAt,
        });
      }

      return NextResponse.json({
        ...basePayload,
        mode: "can_start_hourly",
      });
    }

    if (reservation) {
      if (!reservation.paid) {
        return NextResponse.json({
          ...basePayload,
          mode: "unpaid",
          reservationId: reservation.id,
        });
      }

      if (!reservation.checkedIn) {
        return NextResponse.json({
          ...basePayload,
          mode: "need_pin_checkin",
          reservationId: reservation.id,
        });
      }

      if (!reservation.checkedOutAt) {
        return NextResponse.json({
          ...basePayload,
          mode: "can_checkout",
          reservationId: reservation.id,
          checkedInAt: reservation.checkedInAt,
        });
      }

      return NextResponse.json({
        ...basePayload,
        mode: "already_checked_out",
        reservationId: reservation.id,
      });
    }

    const openHourly = await prisma.parkingSession.findFirst({
      where: {
        placeId,
        spotId: spot.id,
        sessionType: "HOURLY",
        status: "IN",
        checkOutAt: null,
      },
      orderBy: { checkInAt: "desc" },
      select: {
        id: true,
        checkInAt: true,
      },
    });

    if (openHourly) {
      return NextResponse.json({
        ...basePayload,
        mode: "can_checkout_hourly",
        sessionId: openHourly.id,
        checkedInAt: openHourly.checkInAt,
      });
    }

    return NextResponse.json({
      ...basePayload,
      mode: "can_start_hourly",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}