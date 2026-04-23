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

    if (spot.isActive) {
      return NextResponse.json({
        ok: true,
        alreadyActive: true,
      });
    }

    const updated = await prisma.spot.update({
      where: { id: spotId },
      data: {
        isActive: true,
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
    console.error("reactivate spot error:", e);
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