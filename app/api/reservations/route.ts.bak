import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getReservationFixedPrice } from "@/lib/pricing-core";

const DEFAULT_PLACE_ID = "e24a57f5-787f-4c2e-9394-e5f54053a955";

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

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ? { extra } : {}) },
    { status }
  );
}

function genPin4() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonError("JSONが壊れてます");

    const placeId = String(body.placeId ?? DEFAULT_PLACE_ID).trim();
    const inputSpotId = body.spotId ? String(body.spotId).trim() : null;
    const inputSlot = body.slot ? normalizeSlot(String(body.slot)) : "";
    const date = normalizeDate(String(body.date ?? ""));
    const name = String(body.name ?? "").trim();
    const plate = String(body.plate ?? "").trim();
    const email = body.email ? String(body.email).trim() : null;

    if (!placeId) return jsonError("placeId は必須です");
    if (!date) return jsonError("date は必須です");
    if (!name || !plate) return jsonError("name と plate は必須です");
    if (!inputSpotId && !inputSlot) return jsonError("spotId または slot は必須です");

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

    let spot:
      | {
          id: string;
          placeId: string;
          code: string;
          label: string | null;
          isActive: boolean;
          operationModeOverride:
            | "RESERVATION_ONLY"
            | "HOURLY_ONLY"
            | "RESERVATION_THEN_HOURLY"
            | "CLOSED"
            | null;
        }
      | null = null;

    if (inputSpotId) {
      spot = await prisma.spot.findUnique({
        where: { id: inputSpotId },
        select: {
          id: true,
          placeId: true,
          code: true,
          label: true,
          isActive: true,
          operationModeOverride: true,
        },
      });

      if (!spot || !spot.isActive) {
        return jsonError("選択した区画が見つかりません", 404);
      }

      if (spot.placeId !== placeId) {
        return jsonError("placeId と spotId が一致しません");
      }
    } else {
      spot = await prisma.spot.findFirst({
        where: {
          placeId,
          code: inputSlot,
          isActive: true,
        },
        select: {
          id: true,
          placeId: true,
          code: true,
          label: true,
          isActive: true,
          operationModeOverride: true,
        },
      });

      if (!spot) {
        return jsonError("指定した区画が見つかりません", 404);
      }
    }

    const effectiveOperationMode =
      spot.operationModeOverride ?? place.operationMode;

    if (effectiveOperationMode === "CLOSED") {
      return jsonError("この区画は営業していません", 409, {
        operationMode: effectiveOperationMode,
        placeOperationMode: place.operationMode,
        spotOperationModeOverride: spot.operationModeOverride,
        spotId: spot.id,
        slot: spot.code,
      });
    }

    if (effectiveOperationMode === "HOURLY_ONLY") {
      return jsonError("この区画は時間貸し専用のため予約できません", 409, {
        operationMode: effectiveOperationMode,
        placeOperationMode: place.operationMode,
        spotOperationModeOverride: spot.operationModeOverride,
        spotId: spot.id,
        slot: spot.code,
      });
    }

    const priceYen = await getReservationFixedPrice(placeId, date);
    const pin = genPin4();

    const created = await prisma.reservation.create({
      data: {
        placeId,
        spotId: spot.id,
        date,
        slot: spot.code,
        name,
        plate,
        email,
        price: priceYen,
        pin,
        paid: true,
        paidAt: new Date(),
      },
      select: {
        id: true,
        qrToken: true,
        pin: true,
        price: true,
        placeId: true,
        spotId: true,
        slot: true,
      },
    });

    return NextResponse.json({
      ok: true,
      ...created,
      operationMode: effectiveOperationMode,
      placeOperationMode: place.operationMode,
      spotOperationModeOverride: spot.operationModeOverride,
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return jsonError("この区画は予約済みです", 409);
    }

    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawDate = url.searchParams.get("date");
    const placeId = url.searchParams.get("placeId") ?? DEFAULT_PLACE_ID;

    if (!rawDate) {
      return NextResponse.json({
        ok: true,
        hint: 'add "?date=YYYY-MM-DD&placeId=..."',
        receivedUrl: url.toString(),
      });
    }

    const date = normalizeDate(rawDate);

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      include: {
        spots: {
          where: { isActive: true },
          orderBy: { code: "asc" },
        },
      },
    });

    if (!place) {
      return jsonError("place が見つかりません", 404);
    }

    const rows = await prisma.reservation.findMany({
      where: { date, placeId },
      select: { spotId: true, slot: true },
    });

    const reservedSpotIds = rows
      .map((r) => r.spotId)
      .filter((v): v is string => Boolean(v));

    return NextResponse.json({
      ok: true,
      mode: "place-spots",
      date,
      place: {
        id: place.id,
        name: place.name,
        address: place.address,
        operationMode: place.operationMode,
      },
      spots: place.spots.map((s) => ({
        id: s.id,
        code: s.code,
        label: s.label,
        operationModeOverride: s.operationModeOverride,
        effectiveOperationMode: s.operationModeOverride ?? place.operationMode,
        isReserved: reservedSpotIds.includes(s.id),
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
