export const runtime = "nodejs";
export const preferredRegion = "hnd1";

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

    const placeId = String(body.placeId ?? "").trim();
    const operationMode = String(body.operationMode ?? "").trim();

    if (!placeId) {
      return NextResponse.json({ ok: false, error: "place_id_required" }, { status: 400 });
    }

    if (
      ![
        "RESERVATION_ONLY",
        "HOURLY_ONLY",
        "RESERVATION_THEN_HOURLY",
        "EVENT_ONLY",
        "CLOSED",
        "MONTHLY",
      ].includes(operationMode)
    ) {
      return NextResponse.json(
        { ok: false, error: "operation_mode_invalid" },
        { status: 400 }
      );
    }

    const updated = await prisma.place.update({
      where: { id: placeId },
      data: {
        operationMode: operationMode as
          | "RESERVATION_ONLY"
          | "HOURLY_ONLY"
          | "RESERVATION_THEN_HOURLY"
          | "EVENT_ONLY"
          | "CLOSED"
          | "MONTHLY",
      },
      select: {
        id: true,
        slug: true,
        name: true,
        operationMode: true,
      },
    });

    return NextResponse.json({
      ok: true,
      place: updated,
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