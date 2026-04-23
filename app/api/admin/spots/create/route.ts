import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function normalizeCode(v: string) {
  return v.trim().toUpperCase();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const placeId = String(body.placeId ?? "").trim();
    const code = normalizeCode(String(body.code ?? ""));
    const label = String(body.label ?? "").trim() || code;
    const operationModeOverride = String(
      body.operationModeOverride ?? "HOURLY_ONLY"
    ).trim();

    if (!placeId) {
      return NextResponse.json(
        { ok: false, error: "missing_placeId", message: "placeId が必要です" },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { ok: false, error: "missing_code", message: "SLOTコードが必要です" },
        { status: 400 }
      );
    }

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, name: true },
    });

    if (!place) {
      return NextResponse.json(
        { ok: false, error: "place_not_found", message: "Placeが見つかりません" },
        { status: 404 }
      );
    }

    const existing = await prisma.spot.findFirst({
      where: {
        placeId,
        code,
      },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (existing && existing.isActive) {
      return NextResponse.json(
        {
          ok: false,
          error: "spot_exists",
          message: `SLOT ${code} はすでに存在します`,
        },
        { status: 409 }
      );
    }

    if (existing && !existing.isActive) {
      const reactivated = await prisma.spot.update({
        where: { id: existing.id },
        data: {
          label,
          isActive: true,
          operationModeOverride,
        },
        select: {
          id: true,
          code: true,
          label: true,
          isActive: true,
          operationModeOverride: true,
        },
      });

      return NextResponse.json({
        ok: true,
        reactivated: true,
        spot: reactivated,
      });
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
        code: true,
        label: true,
        isActive: true,
        operationModeOverride: true,
      },
    });

    return NextResponse.json({
      ok: true,
      created: true,
      spot: created,
    });
  } catch (e: any) {
    console.error("create spot error:", e);
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