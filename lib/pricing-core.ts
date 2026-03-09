import { prisma } from "@/lib/db";

export function ymdToUtcDate(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export async function getReservationFixedPrice(
  placeId: string,
  ymd: string
): Promise<number> {
  const targetDate = ymdToUtcDate(ymd);

  const eventDay = await prisma.eventDay.findFirst({
    where: {
      placeId,
      date: targetDate,
      isActive: true,
    },
    select: {
      fixedYenOverride: true,
    },
  });

  if (eventDay?.fixedYenOverride != null) {
    return eventDay.fixedYenOverride;
  }

  const rule = await prisma.pricingRule.findFirst({
    where: {
      placeId,
      pricingType: "RESERVATION_FIXED",
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
    select: {
      fixedYen: true,
    },
  });

  return rule?.fixedYen ?? 3000;
}

export async function getHourlyRate(
  placeId: string,
  ymd: string
): Promise<number> {
  const targetDate = ymdToUtcDate(ymd);

  const eventDay = await prisma.eventDay.findFirst({
    where: {
      placeId,
      date: targetDate,
      isActive: true,
    },
    select: {
      hourlyYenOverride: true,
    },
  });

  if (eventDay?.hourlyYenOverride != null) {
    return eventDay.hourlyYenOverride;
  }

  const rule = await prisma.pricingRule.findFirst({
    where: {
      placeId,
      pricingType: "HOURLY",
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
    select: {
      hourlyYen: true,
    },
  });

  return rule?.hourlyYen ?? 500;
}