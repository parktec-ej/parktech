import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

function toSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

function makeSpotCode(n: number) {
  return `S${String(n).padStart(2, "0")}`;
}

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const places = await prisma.place.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      spots: {
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          label: true,
          isActive: true,
          operationModeOverride: true,
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    places: places.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      address: p.address,
      ownerId: p.ownerId,
      operationMode: p.operationMode,
      isActive: p.isActive,
      createdAt: p.createdAt,
      spotCount: p.spots.length,
      spots: p.spots,
    })),
  });
}

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

    const name = String(body.name ?? "").trim();
    const rawSlug = String(body.slug ?? "").trim();
    const address = body.address ? String(body.address).trim() : null;
    const operationMode = String(body.operationMode ?? "RESERVATION_THEN_HOURLY").trim();
    const spotCount = Number(body.spotCount ?? 0);

    if (!name) {
      return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
    }

    if (!rawSlug) {
      return NextResponse.json({ ok: false, error: "slug_required" }, { status: 400 });
    }

    const slug = toSlug(rawSlug);
    if (!slug) {
      return NextResponse.json({ ok: false, error: "slug_invalid" }, { status: 400 });
    }

    if (
      !["RESERVATION_ONLY", "HOURLY_ONLY", "RESERVATION_THEN_HOURLY", "CLOSED"].includes(
        operationMode
      )
    ) {
      return NextResponse.json({ ok: false, error: "operation_mode_invalid" }, { status: 400 });
    }

    if (!Number.isInteger(spotCount) || spotCount <= 0 || spotCount > 300) {
      return NextResponse.json({ ok: false, error: "spot_count_invalid" }, { status: 400 });
    }

    const existing = await prisma.place.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ ok: false, error: "slug_already_exists" }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const place = await tx.place.create({
        data: {
          name,
          slug,
          address,
          operationMode: operationMode as
            | "RESERVATION_ONLY"
            | "HOURLY_ONLY"
            | "RESERVATION_THEN_HOURLY"
            | "CLOSED",
          isActive: true,
        },
      });

      await tx.spot.createMany({
        data: Array.from({ length: spotCount }, (_, i) => {
          const code = makeSpotCode(i + 1);
          return {
            placeId: place.id,
            code,
            label: code,
            isActive: true,
            operationModeOverride: null,
          };
        }),
      });

      const spots = await tx.spot.findMany({
        where: { placeId: place.id },
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          label: true,
          isActive: true,
          operationModeOverride: true,
        },
      });

      return { place, spots };
    });

    return NextResponse.json({
      ok: true,
      place: {
        id: result.place.id,
        slug: result.place.slug,
        name: result.place.name,
        address: result.place.address,
        operationMode: result.place.operationMode,
        isActive: result.place.isActive,
        createdAt: result.place.createdAt,
        spotCount: result.spots.length,
        spots: result.spots,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}