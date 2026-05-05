export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActivePlace } from "@/lib/place-resolver";
import {
  getReservationFixedPrice,
  getReservationOpenAtJst,
  isReservationOpen,
  ymdToUtcDate,
} from "@/lib/pricing-core";

type EventDayLite = {
  id: string;
  reservationOpenDaysBefore: number | null;
};

function computeReservationOpen(
  eventDay: EventDayLite | null,
  ymd: string
): {
  ok: boolean;
  openDaysBefore: number;
  openAt: Date | null;
  eventDay: EventDayLite | null;
} {
  if (!eventDay) {
    return { ok: true, openDaysBefore: 0, openAt: null, eventDay: null };
  }

  const openDaysBefore = Number(eventDay.reservationOpenDaysBefore ?? 0);

  if (openDaysBefore <= 0) {
    return { ok: true, openDaysBefore: 0, openAt: null, eventDay };
  }

  const openAt = getReservationOpenAtJst(ymd, openDaysBefore);
  return {
    ok: new Date() >= openAt,
    openDaysBefore,
    openAt,
    eventDay,
  };
}

function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json(
    {
      ok: false,
      error: error ?? "bad_request",
      message,
    },
    { status }
  );
}

function normalizeDate(input: string) {
  const value = String(input ?? "").trim();

  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  return value;
}

function normalizeSlot(input: string) {
  const value = String(input ?? "").trim().toUpperCase();

  if (!value) return "";

  const s = value.match(/^S(\d{1,2})$/i);
  if (s) {
    return `S${String(Number(s[1])).padStart(2, "0")}`;
  }

  const a = value.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) {
    return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;
  }

  return value;
}

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

type OperationMode =
  | "RESERVATION_ONLY"
  | "HOURLY_ONLY"
  | "RESERVATION_THEN_HOURLY"
  | "EVENT_ONLY"
  | "CLOSED";

type SpotRow = {
  id: string;
  code: string;
  label: string | null;
  operationModeOverride: OperationMode | null;
};

type ReservationRow = {
  id: string;
  slot: string;
  spotId: string | null;
  name: string;
  plate: string;
  email: string | null;
  price: number;
  createdAt: Date;
  status: string;
};

type DayModeRow = {
  spotId: string;
  operationMode: OperationMode;
};

async function isActiveEventDay(placeId: string, date: string) {
  const targetDate = ymdToUtcDate(date);

  const row = await prisma.eventDay.findFirst({
    where: {
      placeId,
      date: targetDate,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  return Boolean(row);
}

function canReserve(
  mode: string | null | undefined,
  eventDayActive: boolean
) {
  if (mode === "RESERVATION_ONLY") return true;
  if (mode === "RESERVATION_THEN_HOURLY") return true;
  if (mode === "EVENT_ONLY") return eventDayActive;
  return false;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  console.log("[reservations] start GET");
  try {
    const url = new URL(req.url);

    const date = normalizeDate(
      url.searchParams.get("date") || ymdTodayJst()
    );

    const inputPlaceId = String(
      url.searchParams.get("placeId") ?? ""
    ).trim();

    const inputPlaceSlug = String(
      url.searchParams.get("placeSlug") ?? ""
    ).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(
        "date は YYYY-MM-DD 形式で指定してください",
        400,
        "invalid_date"
      );
    }

    const placeWhere: { id?: string; slug?: string; isActive: boolean } = {
      isActive: true,
    };
    if (inputPlaceId) placeWhere.id = inputPlaceId;
    else if (inputPlaceSlug) placeWhere.slug = inputPlaceSlug;

    const targetUtcDate = ymdToUtcDate(date);

    const [placeRaw, eventDayRaw, spotsRaw, reservationsRaw, dayModesRaw] =
      await Promise.all([
        prisma.place.findFirst({
          where: placeWhere,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            slug: true,
            name: true,
            address: true,
            operationMode: true,
          },
        }),

        prisma.eventDay.findFirst({
          where: {
            place: placeWhere,
            date: targetUtcDate,
            isActive: true,
          },
          select: {
            id: true,
            reservationOpenDaysBefore: true,
          },
        }),

        prisma.spot.findMany({
          where: {
            place: placeWhere,
            isActive: true,
          },
          orderBy: [{ code: "asc" }],
          select: {
            id: true,
            code: true,
            label: true,
            operationModeOverride: true,
          },
        }),

        prisma.reservation.findMany({
          where: {
            place: placeWhere,
            date,
            status: "CONFIRMED",
          },
          select: {
            id: true,
            slot: true,
            spotId: true,
            name: true,
            plate: true,
            email: true,
            price: true,
            createdAt: true,
            status: true,
          },
        }),

        prisma.spotModeCalendar.findMany({
          where: {
            place: placeWhere,
            date,
          },
          select: {
            spotId: true,
            operationMode: true,
          },
        }),
      ]);

    const place = placeRaw;
    if (!place) {
      return jsonError("place が見つかりません", 404, "place_not_found");
    }

    const eventDay = eventDayRaw as EventDayLite | null;
    const reservationOpen = computeReservationOpen(eventDay, date);
    const eventDayActive = Boolean(eventDay);

    const spots = spotsRaw as SpotRow[];
    const reservations = reservationsRaw as ReservationRow[];
    const dayModes = dayModesRaw as DayModeRow[];

    const dayModeMap = new Map<string, OperationMode>(
      dayModes.map((x: DayModeRow) => [x.spotId, x.operationMode])
    );

    const reservedSpotIds = new Set<string>(
      reservations
        .map((r: ReservationRow) => r.spotId)
        .filter((x: string | null): x is string => Boolean(x))
    );

    const reservedSlots = new Set<string>(
      reservations
        .map((r: ReservationRow) => normalizeSlot(r.slot))
        .filter((x: string): x is string => Boolean(x))
    );

    const availableSpots = spots.map((spot: SpotRow) => {
      const normalizedCode = normalizeSlot(spot.code);

      const effectiveMode =
        dayModeMap.get(spot.id) ??
        spot.operationModeOverride ??
        place.operationMode ??
        "RESERVATION_ONLY";

      const modeAllowsReservation = canReserve(
        effectiveMode,
        eventDayActive
      );

      return {
        id: spot.id,
        code: spot.code,
        label: spot.label,
        mode: effectiveMode,
        isAvailable:
          reservationOpen.ok &&
          modeAllowsReservation &&
          !reservedSpotIds.has(spot.id) &&
          !reservedSlots.has(normalizedCode),
      };
    });

    return NextResponse.json({
      ok: true,
      place,
      date,
      reservationOpen,
      eventDayActive,
      spots: availableSpots,
      reservations,
    });
  } catch (error: unknown) {
    console.error(error);

    return jsonError(
      "予約一覧取得に失敗しました",
      500,
      "server_error"
    );
  } finally {
    console.log("[reservations] done GET", { ms: Date.now() - startedAt });
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  console.log("[reservations] start POST");
  try {
    const body = await req.json();

    const placeId = String(body.placeId ?? "").trim();
    const placeSlug = String(body.placeSlug ?? "").trim();
    const spotId = String(body.spotId ?? "").trim();

    const date = normalizeDate(
      body.date || ymdTodayJst()
    );

    const name = String(body.name ?? "").trim();
    const plate = String(body.plate ?? "").trim();
    const email = String(body.email ?? "").trim();
    const phone = String(body.phone ?? "").trim();

    if (phone && !/^[0-9\-\s\+\(\)]+$/.test(phone)) {
      return NextResponse.json(
        { ok: false, error: "電話番号の形式が正しくありません" },
        { status: 400 }
      );
    }

    if (!spotId) {
      return jsonError(
        "spotId が必要です",
        400,
        "missing_spot_id"
      );
    }

    if (!name) {
      return jsonError(
        "氏名が必要です",
        400,
        "missing_name"
      );
    }

    if (!plate) {
      return jsonError(
        "車両ナンバーが必要です",
        400,
        "missing_plate"
      );
    }

    const place = await resolveActivePlace({
      placeId,
      placeSlug,
    });

    if (!place) {
      return jsonError(
        "place が見つかりません",
        404,
        "place_not_found"
      );
    }

    const reservationOpen = await isReservationOpen(
      place.id,
      date
    );

    if (!reservationOpen.ok) {
      return jsonError(
        "まだ予約開始前です",
        409,
        "not_open_yet"
      );
    }

    const spot = await prisma.spot.findFirst({
      where: {
        id: spotId,
        placeId: place.id,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        label: true,
        operationModeOverride: true,
      },
    });

    if (!spot) {
      return jsonError(
        "spot が見つかりません",
        404,
        "spot_not_found"
      );
    }

    const dayMode =
      await prisma.spotModeCalendar.findUnique({
        where: {
          spotId_date: {
            spotId: spot.id,
            date,
          },
        },
        select: {
          operationMode: true,
        },
      });

    const eventDayActive =
      await isActiveEventDay(
        place.id,
        date
      );

    const effectiveMode =
      dayMode?.operationMode ??
      spot.operationModeOverride ??
      place.operationMode ??
      "RESERVATION_ONLY";

    if (
      !canReserve(
        effectiveMode,
        eventDayActive
      )
    ) {
      return jsonError(
        effectiveMode === "EVENT_ONLY"
          ? "イベント日以外は予約できません"
          : "この区画は予約不可です",
        409,
        "not_reservable"
      );
    }

    const exists =
      await prisma.reservation.findFirst({
        where: {
          placeId: place.id,
          spotId: spot.id,
          date,
          status: "CONFIRMED",
        },
        select: {
          id: true,
        },
      });

    if (exists) {
      return jsonError(
        "その区画はすでに予約済みです。",
        409,
        "already_reserved"
      );
    }

    const price =
      await getReservationFixedPrice(
        place.id,
        date
      );

    const pin = String(
      Math.floor(
        1000 + Math.random() * 9000
      )
    );

    const created =
      await prisma.reservation.create({
        data: {
          placeId: place.id,
          spotId: spot.id,
          date,
          slot: spot.code,
          name,
          plate,
          email: email || null,
          phone: phone || null,
          price,
          pin,
          paid: false,
          status: "CONFIRMED",
          refundStatus: "NONE",
        },
      });

    return NextResponse.json({
      ok: true,
      reservation: created,
    });
  } catch (error: unknown) {
    console.error(error);

    return jsonError(
      "予約作成に失敗しました",
      500,
      "server_error"
    );
  } finally {
    console.log("[reservations] done POST", { ms: Date.now() - startedAt });
  }
}