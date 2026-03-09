import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function ymdTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function normalizeDate(input: string): string {
  if (!input) return input;
  if (/^\d{8}$/.test(input)) {
    return `${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6, 8)}`;
  }
  return input;
}

function normalizeSlot(input: string): string {
  if (!input) return input.trim();

  const v = input.trim().toUpperCase();

  const s = v.match(/^S(\d{1,2})$/i);
  if (s) return `S${String(Number(s[1])).padStart(2, "0")}`;

  const a = v.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;

  return v;
}

function genPin4() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ? { extra } : {}) },
    { status }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonError("JSONが壊れてます", 400);

    const placeId = String(body.placeId ?? "").trim();
    const date = normalizeDate(String(body.date ?? ymdTodayJst()));
    const slot = normalizeSlot(String(body.slot ?? ""));
    const plate = body.plate ? String(body.plate).trim() : null;

    if (!placeId) return jsonError("placeId は必須です", 400);
    if (!slot) return jsonError("slot は必須です", 400);

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        name: true,
        operationMode: true,
        isActive: true,
      },
    });

    if (!place || !place.isActive) {
      return jsonError("place が見つかりません", 404);
    }

    const spot = await prisma.spot.findFirst({
      where: {
        placeId,
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
      return jsonError("spot が見つかりません", 404, { placeId, slot });
    }

    const effectiveOperationMode =
      spot.operationModeOverride ?? place.operationMode;

    const reservation = await prisma.reservation.findFirst({
      where: {
        date,
        placeId,
        spotId: spot.id,
      },
      select: {
        id: true,
        checkedOutAt: true,
      },
    });

    if (effectiveOperationMode === "CLOSED") {
      return jsonError("本日は営業していません", 409, {
        operationMode: effectiveOperationMode,
      });
    }

    if (effectiveOperationMode === "RESERVATION_ONLY") {
      return jsonError("この区画は予約専用です", 409, {
        operationMode: effectiveOperationMode,
      });
    }

    if (effectiveOperationMode === "RESERVATION_THEN_HOURLY" && reservation) {
      if (!reservation.checkedOutAt) {
        return jsonError("この区画は予約が入っています", 409, {
          operationMode: effectiveOperationMode,
          reservationId: reservation.id,
        });
      }
    }

    const openHourly = await prisma.parkingSession.findFirst({
      where: {
        placeId,
        spotId: spot.id,
        sessionType: "HOURLY",
        status: "IN",
        checkOutAt: null,
      },
      orderBy: { checkInAt: "desc" },
      select: {
        id: true,
        checkInAt: true,
      },
    });

    if (openHourly) {
      return NextResponse.json({
        ok: true,
        status: "already_started",
        operationMode: effectiveOperationMode,
        placeOperationMode: place.operationMode,
        spotOperationModeOverride: spot.operationModeOverride,
        sessionId: openHourly.id,
        checkInAt: openHourly.checkInAt,
        placeId,
        spotId: spot.id,
        slot: spot.code,
        date,
      });
    }

    const pin = genPin4();
    const now = new Date();

    const session = await prisma.parkingSession.create({
      data: {
        placeId,
        spotId: spot.id,
        sessionType: "HOURLY",
        plate,
        checkInAt: now,
        status: "IN",
      },
      select: {
        id: true,
        checkInAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      status: "started",
      operationMode: effectiveOperationMode,
      placeOperationMode: place.operationMode,
      spotOperationModeOverride: spot.operationModeOverride,
      sessionId: session.id,
      checkInAt: session.checkInAt,
      placeId,
      spotId: spot.id,
      slot: spot.code,
      date,
      pin,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.json({
    ok: true,
    hint: 'POST {"placeId":"...","slot":"A-03","date":"YYYY-MM-DD","plate":"宮城300あ1234"}',
    receivedUrl: url.toString(),
  });
}