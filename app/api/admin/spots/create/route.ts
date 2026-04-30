export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

type OperationMode =
  | "RESERVATION_ONLY"
  | "HOURLY_ONLY"
  | "RESERVATION_THEN_HOURLY"
  | "EVENT_ONLY"
  | "CLOSED";

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const fd = await req.formData();

    const placeId = String(fd.get("placeId") ?? "").trim();
    const code = String(fd.get("code") ?? "").trim();
    const label = String(fd.get("label") ?? "").trim();

    const rawOperationModeOverride = String(
      fd.get("operationModeOverride") ?? ""
    )
      .trim()
      .toUpperCase();

    const operationModeOverride: OperationMode | null =
      rawOperationModeOverride === "RESERVATION_ONLY" ||
      rawOperationModeOverride === "HOURLY_ONLY" ||
      rawOperationModeOverride === "RESERVATION_THEN_HOURLY" ||
      rawOperationModeOverride === "EVENT_ONLY" ||
      rawOperationModeOverride === "CLOSED"
        ? rawOperationModeOverride
        : null;

    if (!placeId || !code) {
      return NextResponse.json(
        { ok: false, error: "missing_params" },
        { status: 400 }
      );
    }

    const created = await prisma.spot.create({
      data: {
        placeId,
        code,
        label,
        isActive: true,
        operationModeOverride,
      },
      select: {
        id: true,
        placeId: true,
        code: true,
        label: true,
        isActive: true,
        operationModeOverride: true,
      },
    });

    return NextResponse.json({ ok: true, spot: created });
  } catch (err: unknown) {
    console.error(err);

    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}