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

    const spotId = String(body.spotId ?? "").trim();
    const raw = body.operationModeOverride;

    if (!spotId) {
      return NextResponse.json({ ok: false, error: "spot_id_required" }, { status: 400 });
    }

    const operationModeOverride =
      raw === null || raw === "" || typeof raw === "undefined"
        ? null
        : String(raw).trim();

    if (
      operationModeOverride !== null &&
      ![
        "RESERVATION_ONLY",
        "HOURLY_ONLY",
        "RESERVATION_THEN_HOURLY",
        "EVENT_ONLY",
        "CLOSED",
      ].includes(operationModeOverride)
    ) {
      return NextResponse.json(
        { ok: false, error: "operation_mode_invalid" },
        { status: 400 }
      );
    }

    const updated = await prisma.spot.update({
      where: { id: spotId },
      data: {
        operationModeOverride: operationModeOverride as
          | "RESERVATION_ONLY"
          | "HOURLY_ONLY"
          | "RESERVATION_THEN_HOURLY"
          | "EVENT_ONLY"
          | "CLOSED"
          | null,
      },
      select: {
        id: true,
        code: true,
        label: true,
        operationModeOverride: true,
        placeId: true,
      },
    });

    return NextResponse.json({
      ok: true,
      spot: updated,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}