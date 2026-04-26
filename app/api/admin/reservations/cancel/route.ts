import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

export async function POST(req: Request) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "invalid_json" },
        { status: 400 }
      );
    }

    const reservationId = String(body.reservationId ?? "").trim();

    if (!reservationId) {
      return NextResponse.json(
        { ok: false, error: "reservation_id_required" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { ok: false, error: "reservation_not_found" },
        { status: 404 }
      );
    }

    if (reservation.checkedOutAt) {
      return NextResponse.json(
        { ok: false, error: "already_checked_out" },
        { status: 409 }
      );
    }

    if (reservation.checkedIn) {
      return NextResponse.json(
        { ok: false, error: "checked_in_cannot_cancel" },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.parkingSession.deleteMany({
        where: { reservationId },
      });

      await tx.reservation.delete({
        where: { id: reservationId },
      });
    });

    return NextResponse.json({
      ok: true,
      status: "canceled",
      reservationId,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);

    console.error("POST /api/admin/reservations/cancel error:", e);

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message,
      },
      { status: 500 }
    );
  }
}