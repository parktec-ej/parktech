import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function normalizeSlot(input: string): string {
  if (!input) return "";

  const v = input.trim().toUpperCase();

  const s = v.match(/^S(\d{1,2})$/i);
  if (s) return `S${String(Number(s[1])).padStart(2, "0")}`;

  const a = v.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;

  return v;
}

function normalizeDate(input: string): string {
  const v = String(input ?? "").trim();
  if (!v) return "";
  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }
  return v;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const placeKey = String(body?.placeId ?? "").trim();
    const date = normalizeDate(String(body?.date ?? "").trim());
    const pin = String(body?.pin ?? "").trim();
    const rawSlot = String(body?.slot ?? "").trim();

    if (!placeKey) {
      return NextResponse.json(
        { ok: false, error: "placeId_required" },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { ok: false, error: "date_required" },
        { status: 400 }
      );
    }

    if (!rawSlot) {
      return NextResponse.json(
        { ok: false, error: "slot_required" },
        { status: 400 }
      );
    }

    if (!pin) {
      return NextResponse.json(
        { ok: false, error: "pin_required" },
        { status: 400 }
      );
    }

    const slot = normalizeSlot(rawSlot);

    const place = await prisma.place.findFirst({
      where: {
        OR: [{ id: placeKey }, { slug: placeKey }],
      },
      select: {
        id: true,
        slug: true,
        isActive: true,
      },
    });

    if (!place || !place.isActive) {
      return NextResponse.json(
        { ok: false, error: "place_not_found" },
        { status: 404 }
      );
    }

    const resolvedPlaceId = place.id;

    const spot = await prisma.spot.findFirst({
      where: {
        placeId: resolvedPlaceId,
        code: slot,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
      },
    });

    if (!spot) {
      return NextResponse.json(
        { ok: false, error: "spot_not_found" },
        { status: 404 }
      );
    }

    const reservation = await prisma.reservation.findFirst({
      where: {
        placeId: resolvedPlaceId,
        spotId: spot.id,
        date,
      },
      select: {
        id: true,
        pin: true,
        paid: true,
        checkedIn: true,
        checkedInAt: true,
        checkedOutAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { ok: false, error: "no_reservation" },
        { status: 404 }
      );
    }

    if (!reservation.paid) {
      return NextResponse.json(
        { ok: false, error: "unpaid" },
        { status: 400 }
      );
    }

    if (reservation.checkedOutAt) {
      return NextResponse.json(
        { ok: false, error: "already_checked_out" },
        { status: 400 }
      );
    }

    if (reservation.pin !== pin) {
      return NextResponse.json(
        { ok: false, error: "invalid_pin" },
        { status: 400 }
      );
    }

    if (reservation.checkedIn) {
      return NextResponse.json({
        ok: true,
        status: "already_checked_in",
        reservationId: reservation.id,
        checkedInAt: reservation.checkedInAt,
        placeId: resolvedPlaceId,
        placeSlug: place.slug,
        spotId: spot.id,
        date,
        slot,
      });
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const updatedReservation = await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          checkedIn: true,
          checkedInAt: now,
        },
        select: {
          id: true,
          checkedInAt: true,
        },
      });

      const existingOpenSession = await tx.parkingSession.findFirst({
        where: {
          reservationId: reservation.id,
          placeId: resolvedPlaceId,
          spotId: spot.id,
          sessionType: "RESERVATION",
          status: "IN",
          checkOutAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!existingOpenSession) {
        await tx.parkingSession.create({
          data: {
            reservationId: reservation.id,
            placeId: resolvedPlaceId,
            spotId: spot.id,
            sessionType: "RESERVATION",
            checkInAt: now,
            status: "IN",
          },
        });
      }

      return updatedReservation;
    });

    return NextResponse.json({
      ok: true,
      status: "checked_in",
      reservationId: updated.id,
      checkedInAt: updated.checkedInAt,
      placeId: resolvedPlaceId,
      placeSlug: place.slug,
      spotId: spot.id,
      date,
      slot,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: String(error?.message ?? error),
      },
      { status: 500 }
    );
  }
}