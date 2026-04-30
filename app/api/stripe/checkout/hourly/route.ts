import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

function normalizeSlot(input: string): string {
  if (!input) return "";

  const v = input.trim().toUpperCase();

  const s = v.match(/^S(\d{1,2})$/i);
  if (s) return `S${String(Number(s[1])).padStart(2, "0")}`;

  const a = v.match(/^([A-Z])[- ]?(\d{1,2})$/i);
  if (a) return `${a[1].toUpperCase()}-${String(Number(a[2])).padStart(2, "0")}`;

  return v;
}

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

function jsonError(message: string, status = 400, extra?: unknown) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ? { extra } : {}) },
    { status }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonError("JSONが壊れています");

    const placeKey = String(body.placeId ?? "").trim();
    const rawSlot = String(body.slot ?? "").trim();
    const date = String(body.date ?? ymdTodayJst()).trim();

    if (!placeKey) return jsonError("placeId は必須です");
    if (!rawSlot) return jsonError("slot は必須です");

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
    if (!baseUrl) {
      return jsonError("NEXT_PUBLIC_BASE_URL が未設定です", 500);
    }

    const slot = normalizeSlot(rawSlot);

    const place = await prisma.place.findFirst({
      where: {
        OR: [{ id: placeKey }, { slug: placeKey }],
        isActive: true,
      },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });

    if (!place) {
      return jsonError("place が見つかりません", 404);
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
      return jsonError("spot が見つかりません", 404);
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
        paymentRef: true,
      },
    });

    if (!session) {
      return jsonError("時間貸しセッションが見つかりません", 404);
    }

    if (session.paid) {
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        sessionId: session.id,
        message: "この時間貸しセッションはすでに決済済みです",
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
      return jsonError("時間貸し料金が設定されていません", 500);
    }

    const now = new Date();
    const totalMinutes = Math.max(
      1,
      Math.ceil((now.getTime() - session.checkInAt.getTime()) / 60000)
    );
    const billedHours = Math.ceil(totalMinutes / 60);
    const totalYen = billedHours * hourlyYen;

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${baseUrl}/hourly-checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/hourly-checkout?placeId=${encodeURIComponent(
        place.slug || place.id
      )}&slot=${encodeURIComponent(spot.code)}&date=${encodeURIComponent(date)}`,
      client_reference_id: `hourly:${session.id}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "jpy",
            unit_amount: totalYen,
            product_data: {
              name: `${place.name} ${spot.code} 時間貸し精算`,
              description: `${date} / ${spot.label ?? spot.code} / ${billedHours}時間`,
            },
          },
        },
      ],
      metadata: {
        flow: "hourly_checkout",
        parkingSessionId: session.id,
        placeId: place.id,
        placeSlug: place.slug,
        spotId: spot.id,
        slot: spot.code,
        date,
        plate: session.plate ?? "",
        phone: session.phone ?? "",
        customerName: session.customerName ?? "",
        hourlyYen: String(hourlyYen),
        totalMinutes: String(totalMinutes),
        billedHours: String(billedHours),
        totalYen: String(totalYen),
      },
    });

    return NextResponse.json({
      ok: true,
      checkoutSessionId: checkout.id,
      url: checkout.url,
      parkingSessionId: session.id,
      placeId: place.id,
      placeSlug: place.slug,
      slot: spot.code,
      date,
      totalMinutes,
      billedHours,
      hourlyYen,
      totalYen,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: String(e?.message ?? e),
      },
      { status: 500 }
    );
  }
}
