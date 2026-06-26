export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  MONTHLY_PLACE_SLUG,
  MONTHLY_SLOT_CODES,
  OCCUPYING_STATUSES,
} from "@/lib/monthly-config";

export async function GET() {
  try {
    const place = await prisma.place.findFirst({
      where: { slug: MONTHLY_PLACE_SLUG, isActive: true },
      select: { id: true, name: true },
    });
    if (!place) {
      return NextResponse.json(
        { ok: false, error: "place_not_found" },
        { status: 404 }
      );
    }

    const spots = await prisma.spot.findMany({
      where: {
        placeId: place.id,
        isActive: true,
        code: { in: [...MONTHLY_SLOT_CODES] },
      },
      select: { id: true, code: true },
    });

    // 進行中契約が専有している spotId 集合
    const occupied = await prisma.monthlyContract.findMany({
      where: {
        placeId: place.id,
        status: { in: [...OCCUPYING_STATUSES] },
        spotId: { in: spots.map((s) => s.id) },
      },
      select: { spotId: true },
    });
    const occupiedSet = new Set(
      occupied.map((c) => c.spotId).filter((x): x is string => Boolean(x))
    );

    // 定義順に整列。実在しない code は spotId=null / available=false で返す。
    const byCode = new Map(spots.map((s) => [s.code, s.id]));
    const slots = MONTHLY_SLOT_CODES.map((code) => {
      const spotId = byCode.get(code) ?? null;
      return {
        code,
        spotId,
        available: Boolean(spotId) && !occupiedSet.has(spotId as string),
      };
    });

    return NextResponse.json({ ok: true, placeName: place.name, slots });
  } catch (e) {
    console.error("[monthly/slots] error:", e);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}
