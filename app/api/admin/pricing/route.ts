import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { ymdToUtcDate } from "@/lib/pricing-core";

function normalizeEventDays(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const ymd = input
    .map((v) => String(v).trim())
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v));

  return Array.from(new Set(ymd)).sort();
}

export async function GET(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const placeId = String(url.searchParams.get("placeId") ?? "").trim();

  if (!placeId) {
    return NextResponse.json({ ok: false, error: "place_id_required" }, { status: 400 });
  }

  const place = await prisma.place.findUnique({
    where: { id: placeId },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });

  if (!place) {
    return NextResponse.json({ ok: false, error: "place_not_found" }, { status: 404 });
  }

  const pricingRules = await prisma.pricingRule.findMany({
    where: {
      placeId,
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
    select: {
      pricingType: true,
      fixedYen: true,
      hourlyYen: true,
      roundingType: true,
    },
  });

  const reservationRule = pricingRules.find((r) => r.pricingType === "RESERVATION_FIXED");
  const hourlyRule = pricingRules.find((r) => r.pricingType === "HOURLY");

  const eventDays = await prisma.eventDay.findMany({
    where: {
      placeId,
      isActive: true,
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      label: true,
      fixedYenOverride: true,
      hourlyYenOverride: true,
    },
  });

  return NextResponse.json({
    ok: true,
    place,
    pricing: {
      reservationFixedYen: reservationRule?.fixedYen ?? 3000,
      hourlyYen: hourlyRule?.hourlyYen ?? 500,
      eventFixedYen: eventDays[0]?.fixedYenOverride ?? reservationRule?.fixedYen ?? 3000,
      eventHourlyYen: eventDays[0]?.hourlyYenOverride ?? hourlyRule?.hourlyYen ?? 500,
      roundingType: hourlyRule?.roundingType ?? "CEIL_HOUR",
      eventDays: eventDays.map((e) => ({
        id: e.id,
        date: e.date.toISOString().slice(0, 10),
        label: e.label ?? "EVENT",
        fixedYenOverride: e.fixedYenOverride,
        hourlyYenOverride: e.hourlyYenOverride,
      })),
    },
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

    const placeId = String(body.placeId ?? "").trim();
    const reservationFixedYen = Number(body.reservationFixedYen ?? 0);
    const hourlyYen = Number(body.hourlyYen ?? 0);
    const eventFixedYen = Number(body.eventFixedYen ?? 0);
    const eventHourlyYen = Number(body.eventHourlyYen ?? 0);
    const eventDays = normalizeEventDays(body.eventDays);

    if (!placeId) {
      return NextResponse.json({ ok: false, error: "place_id_required" }, { status: 400 });
    }

    if (
      !Number.isInteger(reservationFixedYen) ||
      !Number.isInteger(hourlyYen) ||
      !Number.isInteger(eventFixedYen) ||
      !Number.isInteger(eventHourlyYen)
    ) {
      return NextResponse.json({ ok: false, error: "price_must_be_integer" }, { status: 400 });
    }

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, name: true },
    });

    if (!place) {
      return NextResponse.json({ ok: false, error: "place_not_found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      const reservationRule = await tx.pricingRule.findFirst({
        where: { placeId, pricingType: "RESERVATION_FIXED" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      if (reservationRule) {
        await tx.pricingRule.update({
          where: { id: reservationRule.id },
          data: {
            fixedYen: reservationFixedYen,
            hourlyYen: null,
            roundingType: "CEIL_HOUR",
            isActive: true,
          },
        });
      } else {
        await tx.pricingRule.create({
          data: {
            placeId,
            pricingType: "RESERVATION_FIXED",
            fixedYen: reservationFixedYen,
            hourlyYen: null,
            roundingType: "CEIL_HOUR",
            isActive: true,
          },
        });
      }

      const hourlyRule = await tx.pricingRule.findFirst({
        where: { placeId, pricingType: "HOURLY" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      if (hourlyRule) {
        await tx.pricingRule.update({
          where: { id: hourlyRule.id },
          data: {
            fixedYen: null,
            hourlyYen,
            roundingType: "CEIL_HOUR",
            isActive: true,
          },
        });
      } else {
        await tx.pricingRule.create({
          data: {
            placeId,
            pricingType: "HOURLY",
            fixedYen: null,
            hourlyYen,
            roundingType: "CEIL_HOUR",
            isActive: true,
          },
        });
      }

      await tx.eventDay.deleteMany({
        where: { placeId },
      });

      if (eventDays.length > 0) {
        await tx.eventDay.createMany({
          data: eventDays.map((ymd) => ({
            placeId,
            date: ymdToUtcDate(ymd),
            label: "EVENT",
            fixedYenOverride: eventFixedYen,
            hourlyYenOverride: eventHourlyYen,
            isActive: true,
          })),
        });
      }
    });

    return NextResponse.json({
      ok: true,
      saved: {
        placeId,
        reservationFixedYen,
        hourlyYen,
        eventFixedYen,
        eventHourlyYen,
        eventDays,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}