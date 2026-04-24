import { NextResponse } from "next/server";
import { OperationMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

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
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}