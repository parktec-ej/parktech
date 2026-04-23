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

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
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

    if (!slot) {
      return jsonError("slot が必要です", 400, "missing_slot");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError("date は YYYY-MM-DD 形式で指定してください", 400, "invalid_date");
    }

    const place = await resolveActivePlace({
      placeId: inputPlaceId,
      placeSlug: inputPlaceSlug,
    });

    if (!place) {
      return jsonError("place が見つかりません", 404, "place_not_found");
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
      },
    });

    if (!spot) {
      return jsonError("spot が見つかりません", 404, "spot_not_found");
    }

    const session = await prisma.parkingSession.findFirst({
      where: {
        placeId: place.id,
        spotId: spot.id,
        sessionType: "HOURLY",
        status: "IN",
        checkOutAt: null,
      },
      orderBy: {
        checkInAt: "desc",
      },
      select: {
        id: true,
        plate: true,
        phone: true,
        customerName: true,
        checkInAt: true,
        paid: true,
        paidAt: true,
        paymentRef: true,
      },
    });

    if (!session) {
      return jsonError("時間貸しセッションが見つかりません", 404, "hourly_session_not_found");
    }

    if (session.paid) {
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        message: "この時間貸しセッションはすでに決済済みです",
        parkingSessionId: session.id,
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
        session: {
          id: session.id,
          plate: session.plate,
          phone: session.phone,
          customerName: session.customerName,
          checkInAt: session.checkInAt,
          paidAt: session.paidAt,
          paymentRef: session.paymentRef,
        },
      });
    }

    const pricingRule = await prisma.pricingRule.findFirst({
      where: {
        placeId: place.id,
        pricingType: "HOURLY",
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        hourlyYen: true,
      },
    });

    let hourlyYen = pricingRule?.hourlyYen ?? 0;

    const eventDay = await prisma.eventDay.findFirst({
      where: {
        placeId: place.id,
        isActive: true,
        date: {
          gte: new Date(`${date}T00:00:00+09:00`),
          lte: new Date(`${date}T23:59:59.999+09:00`),
        },
      },
      select: {
        hourlyYenOverride: true,
      },
    });

    if (eventDay?.hourlyYenOverride != null) {
      hourlyYen = eventDay.hourlyYenOverride;
    }

    if (!hourlyYen || hourlyYen <= 0) {
      return jsonError("時間貸し料金が設定されていません", 500, "hourly_price_not_configured");
    }

    const now = new Date();
    const totalMinutes = Math.max(
      1,
      Math.ceil((now.getTime() - session.checkInAt.getTime()) / 60000)
    );
    const billedHours = Math.ceil(totalMinutes / 60);
    const totalYen = billedHours * hourlyYen;

    return NextResponse.json({
      ok: true,
      alreadyPaid: false,
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
      session: {
        id: session.id,
        plate: session.plate,
        phone: session.phone,
        customerName: session.customerName,
        checkInAt: session.checkInAt,
      },
      pricing: {
        totalMinutes,
        billedHours,
        hourlyYen,
        totalYen,
      },
      date,
    });
  } catch (error) {
    console.error("POST /api/hourly-checkout error:", error);
    return jsonError("時間貸し精算情報の取得に失敗しました", 500, "internal_error");
  }
}