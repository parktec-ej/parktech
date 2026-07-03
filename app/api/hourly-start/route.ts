export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActivePlace } from "@/lib/place-resolver";

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

function normalizePhone(input: string) {
  return String(input ?? "").replace(/[^\d]/g, "");
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
  | "CLOSED"
  | "MONTHLY";

function canStartHourly(mode: string | null | undefined) {
  return mode === "HOURLY_ONLY" || mode === "RESERVATION_THEN_HOURLY";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return jsonError("JSON body が必要です", 400, "invalid_body");
    }

    const inputPlaceId = String(body.placeId ?? "").trim();
    const inputPlaceSlug = String(body.placeSlug ?? "").trim();
    const slot = normalizeSlot(body.slot ?? "");
    const date = normalizeDate(body.date ?? ymdTodayJst());

    const plate = String(body.plate ?? "").trim();
    const phone = normalizePhone(body.phone ?? "");
    const customerName = String(body.customerName ?? "").trim() || null;

    if (!slot) {
      return jsonError("slot が必要です", 400, "missing_slot");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(
        "date は YYYY-MM-DD 形式で指定してください",
        400,
        "invalid_date"
      );
    }

    if (!plate) {
      return jsonError("車番が必要です", 400, "missing_plate");
    }

    if (!phone) {
      return jsonError("電話番号が必要です", 400, "missing_phone");
    }

    if (phone.length < 10 || phone.length > 11) {
      return jsonError(
        "電話番号の形式が不正です",
        400,
        "invalid_phone"
      );
    }

    const place = await resolveActivePlace({
      placeId: inputPlaceId,
      placeSlug: inputPlaceSlug,
    });

    if (!place) {
      return jsonError(
        "place が見つかりません",
        404,
        "place_not_found"
      );
    }

    const spot = await prisma.spot.findFirst({
      where: {
        placeId: place.id,
        code: slot,
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

    const effectiveMode =
      (dayMode?.operationMode as OperationMode | undefined) ??
      (spot.operationModeOverride as OperationMode | null) ??
      (place.operationMode as OperationMode | null) ??
      "RESERVATION_ONLY";

    if (effectiveMode === "CLOSED") {
      return jsonError(
        "この区画は本日クローズです",
        403,
        "spot_closed_on_date"
      );
    }

    if (!canStartHourly(effectiveMode)) {
      return jsonError(
        effectiveMode === "EVENT_ONLY"
          ? "この区画はイベント予約専用です。時間貸しは開始できません"
          : "この区画は予約専用です。時間貸しは開始できません",
        403,
        "spot_not_hourly_on_date"
      );
    }

    const activeSession = await prisma.parkingSession.findFirst({
      where: {
        placeId: place.id,
        spotId: spot.id,
        status: "IN",
      },
      select: {
        id: true,
      },
    });

    if (activeSession) {
      return jsonError(
        "この区画はすでに入庫中です",
        409,
        "session_already_active"
      );
    }

    const session = await prisma.parkingSession.create({
      data: {
        placeId: place.id,
        spotId: spot.id,
        sessionType: "HOURLY",
        plate,
        phone,
        customerName,
        status: "IN",
      },
      select: {
        id: true,
        placeId: true,
        spotId: true,
        plate: true,
        phone: true,
        customerName: true,
        status: true,
        checkInAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      session,
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
      effectiveMode,
      date,
    });
  } catch (error) {
    console.error("POST /api/hourly-start error:", error);
    return jsonError(
      "時間貸し入庫の開始に失敗しました",
      500,
      "internal_error"
    );
  }
}