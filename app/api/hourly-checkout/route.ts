import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getHourlyRate } from "@/lib/pricing-core";

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
  if (s) {
    return `S${String(Number(s[1])).padStart(2, "0")}`;
  }

  const a = v.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) {
    return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;
  }

  return v;
}

function diffMinutesCeil(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  const minutes = Math.max(0, Math.ceil(ms / 1000 / 60));
  return minutes;
}

function calcCeilHourYen(totalMinutes: number, hourlyYen: number) {
  const hours = Math.max(1, Math.ceil(totalMinutes / 60));
  return hours * hourlyYen;
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

    const openSession = await prisma.parkingSession.findFirst({
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
        plate: true,
        checkInAt: true,
      },
    });

    if (!openSession) {
      return jsonError("時間貸しの入庫中セッションがありません", 404, {
        placeId,
        slot,
      });
    }

    const now = new Date();
    const totalMinutes = diffMinutesCeil(openSession.checkInAt, now);

    const hourlyYen = await getHourlyRate(placeId, date);
    const totalYen = calcCeilHourYen(totalMinutes, hourlyYen);

    const updated = await prisma.parkingSession.update({
      where: { id: openSession.id },
      data: {
        checkOutAt: now,
        totalMinutes,
        totalYen,
        status: "OUT",
      },
      select: {
        id: true,
        plate: true,
        checkInAt: true,
        checkOutAt: true,
        totalMinutes: true,
        totalYen: true,
      },
    });

    return NextResponse.json({
      ok: true,
      status: "hourly_checked_out",
      operationMode: effectiveOperationMode,
      placeOperationMode: place.operationMode,
      spotOperationModeOverride: spot.operationModeOverride,
      placeId,
      spotId: spot.id,
      slot: spot.code,
      sessionId: updated.id,
      plate: updated.plate,
      checkInAt: updated.checkInAt,
      checkOutAt: updated.checkOutAt,
      totalMinutes: updated.totalMinutes,
      totalYen: updated.totalYen,
      hourlyYen,
      pricingRule: "DB_PRICINGRULE_OR_EVENTDAY_CEIL_HOUR",
      date,
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
    hint: 'POST {"placeId":"...","slot":"A-03","date":"YYYY-MM-DD"}',
    receivedUrl: url.toString(),
  });
}