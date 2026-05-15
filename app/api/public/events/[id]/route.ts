export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ALLOW_ORIGINS = ["https://parktec-ej.com", "https://www.parktec-ej.com", "https://new.parktec-ej.com"];

function corsHeaders(origin: string | null) {
  const allowed =
    origin && ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=60, s-maxage=60",
  };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const origin = req.headers.get("origin");
  try {
    const { id } = await context.params;
    const e = await prisma.event.findFirst({
      where: { id, status: "published" },
      select: {
        id: true,
        title: true,
        description: true,
        venue: true,
        category: true,
        startAt: true,
        endAt: true,
        doorOpenAt: true,
        showStartAt: true,
        officialUrl: true,
        ourPrice: true,
        bookingStartAt: true,
        bookingStartTime: true,
        place: { select: { slug: true, name: true } },
        venueGroupId: true,
        venueGroup: {
          select: {
            id: true,
            name: true,
            parkings: {
              where: { showOnHp: true },
              select: { parkingSlug: true },
            },
          },
        },
      },
    });

    if (!e) {
      return NextResponse.json(
        { ok: false, error: "event_not_found" },
        { status: 404, headers: corsHeaders(origin) }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        event: {
          id: e.id,
          title: e.title,
          description: e.description,
          venue: e.venue,
          category: e.category,
          startAt: e.startAt.toISOString(),
          endAt: e.endAt ? e.endAt.toISOString() : null,
          doorOpenAt: e.doorOpenAt ? e.doorOpenAt.toISOString() : null,
          showStartAt: e.showStartAt ? e.showStartAt.toISOString() : null,
          officialUrl: e.officialUrl,
          ourPrice: e.ourPrice,
          bookingStartAt: e.bookingStartAt
            ? e.bookingStartAt.toISOString()
            : null,
          bookingStartTime: e.bookingStartTime,
          place: e.place,
          venueGroupId: e.venueGroupId,
          venueGroup: e.venueGroup
            ? {
                id: e.venueGroup.id,
                name: e.venueGroup.name,
                parkings: e.venueGroup.parkings.map((p) => ({
                  parkingSlug: p.parkingSlug,
                })),
              }
            : null,
        },
      },
      { headers: corsHeaders(origin) }
    );
  } catch (error) {
    console.error("[public/events/[id]] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
