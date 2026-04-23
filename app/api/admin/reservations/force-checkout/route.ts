import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const reservationId = String(body.reservationId ?? "").trim();
    if (!reservationId) {
      return NextResponse.json({ ok: false, error: "reservation_id_required" }, { status: 400 });
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        checkedIn: true,
        checkedOutAt: true,
      },
    });

    if (!reservation) {
      return NextResponse.json({ ok: false, error: "reservation_not_found" }, { status: 404 });
    }

    if (reservation.checkedOutAt) {
      return NextResponse.json({
        ok: true,
        status: "already_checked_out",
        reservationId,
      });
    }

    if (!reservation.checkedIn) {
      return NextResponse.json({ ok: false, error: "not_checked_in" }, { status: 409 });
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          checkedOutAt: now,
        },
      });

      await tx.parkingSession.updateMany({
        where: {
          reservationId,
          checkOutAt: null,
        },
        data: {
          checkOutAt: now,
          status: "OUT",
        },
      });
    });

    return NextResponse.json({
      ok: true,
      status: "forced_checked_out",
      reservationId,
      checkedOutAt: now,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: String(e?.message ?? e),
      },
      { status: 500 }
    );
  }
}