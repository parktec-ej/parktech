import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function normalizeDate(input: string): string {
  const v = String(input ?? "").trim();

  if (!v) return "";

  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }

  return v;
}

function isValidDate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isValidOperationMode(v: string) {
  return [
    "RESERVATION_ONLY",
    "HOURLY_ONLY",
    "RESERVATION_THEN_HOURLY",
    "EVENT_ONLY",
    "CLOSED",
  ].includes(v);
}

function jsonError(
  error: string,
  message: string,
  status = 400,
  extra?: unknown
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      message,
      ...(extra ? { extra } : {}),
    },
    { status }
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const placeKey = String(
      url.searchParams.get("placeId") ?? ""
    ).trim();

    const date = normalizeDate(
      String(url.searchParams.get("date") ?? "").trim()
    );

    if (!placeKey) {
      return jsonError(
        "missing_place_id",
        "placeId は必須です",
        400
      );
    }

    if (!date || !isValidDate(date)) {
      return jsonError(
        "invalid_date",
        "date は YYYY-MM-DD 形式で指定してください",
        400
      );
    }

    const place = await prisma.place.findFirst({
      where: {
        OR: [{ id: placeKey }, { slug: placeKey }],
      },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });

    if (!place) {
      return jsonError(
        "place_not_found",
        "place が見つかりません",
        404
      );
    }

    const spots = await prisma.spot.findMany({
      where: {
        placeId: place.id,
        isActive: true,
      },
      orderBy: {
        code: "asc",
      },
      select: {
        id: true,
        code: true,
        label: true,
        operationModeOverride: true,
      },
    });

    const calendars =
      await prisma.spotModeCalendar.findMany({
        where: {
          placeId: place.id,
          date,
        },
        select: {
          id: true,
          spotId: true,
          date: true,
          operationMode: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    const calendarMap = new Map(
      calendars.map((x) => [x.spotId, x])
    );

    const rows = spots.map((spot) => {
      const day = calendarMap.get(spot.id);

      return {
        spotId: spot.id,
        code: spot.code,
        label: spot.label,
        date,
        operationMode: day?.operationMode ?? null,
        inheritedOperationMode:
          spot.operationModeOverride ?? null,
        calendarId: day?.id ?? null,
        createdAt: day?.createdAt ?? null,
        updatedAt: day?.updatedAt ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      place: {
        id: place.id,
        slug: place.slug,
        name: place.name,
      },
      date,
      items: rows,
    });
  } catch (e: any) {
    return jsonError(
      "server_error",
      String(e?.message ?? e),
      500
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return jsonError(
        "invalid_json",
        "JSONが壊れています",
        400
      );
    }

    const placeKey = String(
      body.placeId ?? ""
    ).trim();

    const spotId = String(
      body.spotId ?? ""
    ).trim();

    const date = normalizeDate(
      String(body.date ?? "").trim()
    );

    const operationMode = String(
      body.operationMode ?? ""
    ).trim();

    if (!placeKey) {
      return jsonError(
        "missing_place_id",
        "placeId は必須です",
        400
      );
    }

    if (!spotId) {
      return jsonError(
        "missing_spot_id",
        "spotId は必須です",
        400
      );
    }

    if (!date || !isValidDate(date)) {
      return jsonError(
        "invalid_date",
        "date は YYYY-MM-DD 形式で指定してください",
        400
      );
    }

    if (!isValidOperationMode(operationMode)) {
      return jsonError(
        "invalid_operation_mode",
        "operationMode が不正です",
        400
      );
    }

    const place = await prisma.place.findFirst({
      where: {
        OR: [{ id: placeKey }, { slug: placeKey }],
      },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });

    if (!place) {
      return jsonError(
        "place_not_found",
        "place が見つかりません",
        404
      );
    }

    const spot = await prisma.spot.findFirst({
      where: {
        id: spotId,
        placeId: place.id,
      },
      select: {
        id: true,
        code: true,
        label: true,
        placeId: true,
      },
    });

    if (!spot) {
      return jsonError(
        "spot_not_found",
        "spot が見つかりません",
        404
      );
    }

    const saved =
      await prisma.spotModeCalendar.upsert({
        where: {
          spotId_date: {
            spotId: spot.id,
            date,
          },
        },
        update: {
          operationMode:
            operationMode as any,
        },
        create: {
          placeId: place.id,
          spotId: spot.id,
          date,
          operationMode:
            operationMode as any,
        },
        select: {
          id: true,
          placeId: true,
          spotId: true,
          date: true,
          operationMode: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    return NextResponse.json({
      ok: true,
      item: saved,
      place: {
        id: place.id,
        slug: place.slug,
        name: place.name,
      },
      spot: {
        id: spot.id,
        code: spot.code,
        label: spot.label,
      },
    });
  } catch (e: any) {
    return jsonError(
      "server_error",
      String(e?.message ?? e),
      500
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return jsonError(
        "invalid_json",
        "JSONが壊れています",
        400
      );
    }

    const placeKey = String(
      body.placeId ?? ""
    ).trim();

    const spotId = String(
      body.spotId ?? ""
    ).trim();

    const date = normalizeDate(
      String(body.date ?? "").trim()
    );

    if (!placeKey) {
      return jsonError(
        "missing_place_id",
        "placeId は必須です",
        400
      );
    }

    if (!spotId) {
      return jsonError(
        "missing_spot_id",
        "spotId は必須です",
        400
      );
    }

    if (!date || !isValidDate(date)) {
      return jsonError(
        "invalid_date",
        "date は YYYY-MM-DD 形式で指定してください",
        400
      );
    }

    const place = await prisma.place.findFirst({
      where: {
        OR: [{ id: placeKey }, { slug: placeKey }],
      },
      select: {
        id: true,
      },
    });

    if (!place) {
      return jsonError(
        "place_not_found",
        "place が見つかりません",
        404
      );
    }

    const spot = await prisma.spot.findFirst({
      where: {
        id: spotId,
        placeId: place.id,
      },
      select: {
        id: true,
        code: true,
      },
    });

    if (!spot) {
      return jsonError(
        "spot_not_found",
        "spot が見つかりません",
        404
      );
    }

    const existing =
      await prisma.spotModeCalendar.findUnique({
        where: {
          spotId_date: {
            spotId: spot.id,
            date,
          },
        },
        select: {
          id: true,
        },
      });

    if (!existing) {
      return NextResponse.json({
        ok: true,
        deleted: false,
        message:
          "対象データは存在しませんでした",
      });
    }

    await prisma.spotModeCalendar.delete({
      where: {
        spotId_date: {
          spotId: spot.id,
          date,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      deleted: true,
      spotId: spot.id,
      date,
    });
  } catch (e: any) {
    return jsonError(
      "server_error",
      String(e?.message ?? e),
      500
    );
  }
}