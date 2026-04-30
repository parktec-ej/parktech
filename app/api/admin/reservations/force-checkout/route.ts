export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

type ForceCheckoutBody = {
  reservationId?: unknown;
};

function jsonError(error: string, status: number, message?: string) {
  return NextResponse.json(
    {
      ok: false,
      error,
      ...(message ? { message } : {}),
    },
    { status }
  );
}

export async function POST(req: Request) {
  const admin = await getAdminSession();

  if (!admin) {
    return jsonError("unauthorized", 401);
  }

  try {
    const body = (await req.json().catch(() => null)) as ForceCheckoutBody | null;

    if (!body || typeof body !== "object") {
      return jsonError("invalid_json", 400);
    }

    const reservationId = String(body.reservationId ?? "").trim();

    if (!reservationId) {
      return jsonError("reservation_id_required", 400);
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
      return jsonError("reservation_not_found", 404);
    }

    if (reservation.checkedOutAt) {
      return NextResponse.json({
        ok: true,
        status: "already_checked_out",
        reservationId,
        checkedOutAt: reservation.checkedOutAt.toISOString(),
      });
    }

    if (!reservation.checkedIn) {
      return jsonError("not_checked_in", 409);
    }

    const now = new Date();

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
      checkedOutAt: now.toISOString(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);

    console.error("POST /api/admin/reservations/force-checkout error:", e);

    return jsonError("server_error", 500, message);
  }
}