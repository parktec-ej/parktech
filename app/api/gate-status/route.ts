export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActivePlace } from "@/lib/place-resolver";
import { ymdToUtcDate, getHourlyRate, getDailyRate } from "@/lib/pricing-core";

type OperationMode =
  | "RESERVATION_ONLY"
  | "HOURLY_ONLY"
  | "RESERVATION_THEN_HOURLY"
  | "EVENT_ONLY"
  | "CLOSED"
  | "MONTHLY";

type SpotRow = {
  id: string;
  code: string;
  label: string | null;
  operationModeOverride: string | null;
};

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

  const s = value.match(/^S[- ]?(\d{1,2})$/i);
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

// イベント日に時間貸しを開放するかのスイッチ。
// 現在は利府を EVENT_ONLY のまま運用するため false。
// 塩竈の実証実験を経て EVENT＋時間貸しへ移行する際に true にする。
// その際は app/api/hourly-start/route.ts の canStartHourly() に
// EVENT_ONLY を追加し、同ルートにも EventDay の検索を実装すること。
// 片側だけ変えると再び gate-status と hourly-start が食い違う。
const EVENT_DAY_HOURLY_ENABLED = false;

function isHourlyAllowed(
  mode: string | null | undefined,
  eventDayActive: boolean
) {
  if (mode === "HOURLY_ONLY") return true;
  if (mode === "RESERVATION_THEN_HOURLY") return true;
  if (mode === "EVENT_ONLY") return EVENT_DAY_HOURLY_ENABLED && eventDayActive;
  return false;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  console.log("[gate-status] start");
  try {
    const url = new URL(req.url);

    const inputPlace = String(
      url.searchParams.get("placeId") ??
        url.searchParams.get("place") ??
        url.searchParams.get("placeSlug") ??
        ""
    ).trim();

    const inputSlot = String(url.searchParams.get("slot") ?? "").trim();
    const date = normalizeDate(url.searchParams.get("date") || ymdTodayJst());

    if (!inputPlace) {
      return jsonError("placeId または place が必要です", 400, "missing_place");
    }

    if (!inputSlot) {
      return jsonError("slot が必要です", 400, "missing_slot");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(
        "date は YYYY-MM-DD 形式で指定してください",
        400,
        "invalid_date"
      );
    }

    const normalizedSlot = normalizeSlot(inputSlot);

    const place = await resolveActivePlace({
      placeId: inputPlace,
      placeSlug: inputPlace,
    });

    if (!place) {
      return jsonError("place が見つかりません", 404, "place_not_found");
    }

    const hourlyYen = await getHourlyRate(place.id, date);
    const dailyYen = await getDailyRate(place.id, date);

    const spotsRaw = await prisma.spot.findMany({
      where: {
        placeId: place.id,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        label: true,
        operationModeOverride: true,
      },
      orderBy: [{ code: "asc" }],
    });

    const spots = spotsRaw as SpotRow[];

    const spot =
      spots.find(
        (s: SpotRow) => normalizeSlot(s.code) === normalizedSlot
      ) ??
      spots.find(
        (s: SpotRow) => normalizeSlot(s.label ?? "") === normalizedSlot
      );

    if (!spot) {
      return jsonError("slot に対応する区画が見つかりません", 404, "spot_not_found");
    }

    const dayMode = await prisma.spotModeCalendar.findUnique({
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

    const eventDayActive = await isActiveEventDay(place.id, date);

    const effectiveMode =
      (dayMode?.operationMode as OperationMode | undefined) ??
      (spot.operationModeOverride as OperationMode | null) ??
      (place.operationMode as OperationMode | null) ??
      "RESERVATION_ONLY";

    if (effectiveMode === "CLOSED") {
      return NextResponse.json({
        ok: true,
        mode: "closed",
        placeId: place.id,
        placeSlug: place.slug,
        placeName: place.name,
        hourlyYen,
        dailyYen,
        spotId: spot.id,
        spotLabel: spot.label ?? spot.code,
        slot: spot.code,
        date,
        effectiveOperationMode: effectiveMode,
        dayOperationMode: dayMode?.operationMode ?? null,
        spotOperationModeOverride: spot.operationModeOverride ?? null,
        placeOperationMode: place.operationMode,
        message: "現在この区画は利用停止中です。",
      });
    }

    const reservation = await prisma.reservation.findFirst({
      where: {
        placeId: place.id,
        spotId: spot.id,
        date,
        status: "CONFIRMED",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        paid: true,
        checkedIn: true,
        checkedInAt: true,
        checkedOutAt: true,
        status: true,
      },
    });

    if (reservation) {
      if (!reservation.paid) {
        return NextResponse.json({
          ok: true,
          mode: "unpaid",
          placeId: place.id,
          placeSlug: place.slug,
          placeName: place.name,
        hourlyYen,
        dailyYen,
          spotId: spot.id,
          spotLabel: spot.label ?? spot.code,
          slot: spot.code,
          date,
          reservationId: reservation.id,
          reservationPriority: true,
          checkedInAt: reservation.checkedInAt?.toISOString() ?? null,
          effectiveOperationMode: effectiveMode,
          dayOperationMode: dayMode?.operationMode ?? null,
          spotOperationModeOverride: spot.operationModeOverride ?? null,
          placeOperationMode: place.operationMode,
          message: "未決済の予約があります。管理者へご確認ください。",
        });
      }

      if (reservation.checkedOutAt) {
        return NextResponse.json({
          ok: true,
          mode: "already_checked_out",
          placeId: place.id,
          placeSlug: place.slug,
          placeName: place.name,
        hourlyYen,
        dailyYen,
          spotId: spot.id,
          spotLabel: spot.label ?? spot.code,
          slot: spot.code,
          date,
          reservationId: reservation.id,
          reservationPriority: true,
          checkedInAt: reservation.checkedInAt?.toISOString() ?? null,
          effectiveOperationMode: effectiveMode,
          dayOperationMode: dayMode?.operationMode ?? null,
          spotOperationModeOverride: spot.operationModeOverride ?? null,
          placeOperationMode: place.operationMode,
          message: "この予約はすでに出庫済みです。",
        });
      }

      if (reservation.checkedIn) {
        return NextResponse.json({
          ok: true,
          mode: "can_checkout",
          placeId: place.id,
          placeSlug: place.slug,
          placeName: place.name,
        hourlyYen,
        dailyYen,
          spotId: spot.id,
          spotLabel: spot.label ?? spot.code,
          slot: spot.code,
          date,
          reservationId: reservation.id,
          reservationPriority: true,
          checkedInAt: reservation.checkedInAt?.toISOString() ?? null,
          effectiveOperationMode: effectiveMode,
          dayOperationMode: dayMode?.operationMode ?? null,
          spotOperationModeOverride: spot.operationModeOverride ?? null,
          placeOperationMode: place.operationMode,
          message: "予約利用中です。出庫手続きを進めてください。",
        });
      }

      return NextResponse.json({
        ok: true,
        mode: "need_pin_checkin",
        placeId: place.id,
        placeSlug: place.slug,
        placeName: place.name,
        hourlyYen,
        dailyYen,
        spotId: spot.id,
        spotLabel: spot.label ?? spot.code,
        slot: spot.code,
        date,
        reservationId: reservation.id,
        reservationPriority: true,
        checkedInAt: reservation.checkedInAt?.toISOString() ?? null,
        effectiveOperationMode: effectiveMode,
        dayOperationMode: dayMode?.operationMode ?? null,
        spotOperationModeOverride: spot.operationModeOverride ?? null,
        placeOperationMode: place.operationMode,
        message: "予約済みの方は PIN を入力して入庫してください。",
      });
    }

    const activeSession = await prisma.parkingSession.findFirst({
      where: {
        placeId: place.id,
        spotId: spot.id,
        checkOutAt: null,
        status: "IN",
      },
      orderBy: {
        checkInAt: "desc",
      },
      select: {
        id: true,
        paid: true,
        checkInAt: true,
      },
    });

    if (activeSession) {
      return NextResponse.json({
        ok: true,
        mode: "can_checkout_hourly",
        placeId: place.id,
        placeSlug: place.slug,
        placeName: place.name,
        hourlyYen,
        dailyYen,
        spotId: spot.id,
        spotLabel: spot.label ?? spot.code,
        slot: spot.code,
        date,
        sessionId: activeSession.id,
        checkedInAt: activeSession.checkInAt.toISOString(),
        effectiveOperationMode: effectiveMode,
        dayOperationMode: dayMode?.operationMode ?? null,
        spotOperationModeOverride: spot.operationModeOverride ?? null,
        placeOperationMode: place.operationMode,
        message: "時間貸し利用中です。精算して出庫してください。",
      });
    }

    if (isHourlyAllowed(effectiveMode, eventDayActive)) {
      return NextResponse.json({
        ok: true,
        mode: "can_start_hourly",
        placeId: place.id,
        placeSlug: place.slug,
        placeName: place.name,
        hourlyYen,
        dailyYen,
        spotId: spot.id,
        spotLabel: spot.label ?? spot.code,
        slot: spot.code,
        date,
        effectiveOperationMode: effectiveMode,
        dayOperationMode: dayMode?.operationMode ?? null,
        spotOperationModeOverride: spot.operationModeOverride ?? null,
        placeOperationMode: place.operationMode,
        message: "時間貸し利用が可能です。",
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "no_reservation",
      placeId: place.id,
      placeSlug: place.slug,
      placeName: place.name,
      hourlyYen,
      dailyYen,
      spotId: spot.id,
      spotLabel: spot.label ?? spot.code,
      slot: spot.code,
      date,
      effectiveOperationMode: effectiveMode,
      dayOperationMode: dayMode?.operationMode ?? null,
      spotOperationModeOverride: spot.operationModeOverride ?? null,
      placeOperationMode: place.operationMode,
      message: "ご利用方法を選んでください。",
    });
  } catch (error: unknown) {
    console.error("gate-status error:", error);
    return jsonError("ゲート状態の取得に失敗しました", 500, "server_error");
  } finally {
    console.log("[gate-status] done", { ms: Date.now() - startedAt });
  }
}