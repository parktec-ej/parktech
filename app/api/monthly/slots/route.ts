export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  MONTHLY_PLACE_SLUG,
  OCCUPYING_STATUSES,
  getMonthlyPolicy,
  monthlySpotWhere,
} from "@/lib/monthly-config";

// ?place=<slug> でその駐車場の月極区画を返す。無指定は利府（後方互換）。
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const placeSlug = (url.searchParams.get("place") || MONTHLY_PLACE_SLUG).trim();

    const policy = getMonthlyPolicy(placeSlug);
    if (!policy) {
      return NextResponse.json({ ok: false, error: "not_monthly_place" }, { status: 404 });
    }

    const place = await prisma.place.findFirst({
      where: { slug: placeSlug, isActive: true },
      select: { id: true, name: true },
    });
    if (!place) {
      return NextResponse.json({ ok: false, error: "place_not_found" }, { status: 404 });
    }

    const spots = await prisma.spot.findMany({
      where: { placeId: place.id, isActive: true, ...monthlySpotWhere(placeSlug) },
      select: { id: true, code: true },
      orderBy: { code: "asc" },
    });

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

    const slots = spots.map((s) => ({
      code: s.code,
      spotId: s.id,
      available: !occupiedSet.has(s.id),
    }));

    return NextResponse.json({
      ok: true,
      placeName: place.name,
      feeYen: policy.feeYen,
      slots,
    });
  } catch (e) {
    console.error("[monthly/slots] error:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
