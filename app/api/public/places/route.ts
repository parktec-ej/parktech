export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const revalidate = 60;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const startedAt = Date.now();
  console.log("[public/places] start");
  try {
    const hiddenSlugs = [process.env.PARTNER_BUS_PLACE_SLUG]
      .map((s) => (typeof s === "string" ? s.trim() : s))
      .filter((s): s is string => typeof s === "string" && s.length > 0);

    const places = await prisma.place.findMany({
      where: {
        isActive: true,
        ...(hiddenSlugs.length > 0
          ? { slug: { notIn: hiddenSlugs } }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        address: true,
        operationMode: true,
      },
    });

    return NextResponse.json({
      ok: true,
      places,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        message: String(e?.message ?? e),
      },
      { status: 500 }
    );
  } finally {
    console.log("[public/places] done", { ms: Date.now() - startedAt });
  }
}
