export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const spotId = String(body.spotId ?? "").trim();

    if (!spotId) {
      return NextResponse.json(
        { ok: false, error: "missing_spotId", message: "spotId が必要です" },
        { status: 400 }
      );
    }

    const spot = await prisma.spot.findUnique({
      where: { id: spotId },
      select: {
        id: true,
        code: true,
        isActive: true,
      },
    });

    if (!spot) {
      return NextResponse.json(
        { ok: false, error: "spot_not_found", message: "SLOTが見つかりません" },
        { status: 404 }
      );
    }

    if (!spot.isActive) {
      return NextResponse.json({
        ok: true,
        alreadyInactive: true,
      });
    }

    const inUseCount = await prisma.parkingSession.count({
      where: {
        spotId,
        status: "IN",
      },
    });

    if (inUseCount > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "spot_in_use",
          message: "利用中セッションがあるため停止できません",
        },
        { status: 409 }
      );
    }

    const today = new Date().toLocaleDateString("sv-SE", {
      timeZone: "Asia/Tokyo",
    });

    const futureReservationCount = await prisma.reservation.count({
      where: {
        spotId,
        checkedOutAt: null,
        date: {
          gte: today,
        },
      },
    });

    if (futureReservationCount > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "future_reservation_exists",
          message: "未来予約があるため停止できません",
        },
        { status: 409 }
      );
    }

    const updated = await prisma.spot.update({
      where: { id: spotId },
      data: {
        isActive: false,
      },
      select: {
        id: true,
        code: true,
        label: true,
        isActive: true,
      },
    });

    return NextResponse.json({
      ok: true,
      spot: updated,
    });
  } catch (e: any) {
    console.error("deactivate spot error:", e);
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