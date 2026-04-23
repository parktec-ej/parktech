import { prisma } from "@/lib/db";

export function ymdToUtcDate(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

export function getReservationOpenAtJst(ymd: string, openDaysBefore: number) {
  const base = new Date(`${ymd}T00:00:00+09:00`);
  base.setDate(base.getDate() - openDaysBefore);
  return base;
}

export async function getEventDayConfig(placeId: string, ymd: string) {
  const targetDate = ymdToUtcDate(ymd);

  return prisma.eventDay.findFirst({
    where: {
      placeId,
      date: targetDate,
      isActive: true,
    },
    select: {
      id: true,
      date: true,
      label: true,
      fixedYenOverride: true,
      hourlyYenOverride: true,
      busFixedYen: true,
      reservationOpenDaysBefore: true,
    },
  });
}

export async function isReservationOpen(placeId: string, ymd: string) {
  const eventDay = await getEventDayConfig(placeId, ymd);

  // EventDayが無い日は通常営業日として即予約可
  if (!eventDay) {
    return {
      ok: true,
      openDaysBefore: 0,
      openAt: getReservationOpenAtJst(ymd, 0),
      eventDay: null,
    };
  }

  const openDaysBefore = Number(eventDay.reservationOpenDaysBefore ?? 0);
  const openAt = getReservationOpenAtJst(ymd, openDaysBefore);
  const now = new Date();

  return {
    ok: now >= openAt,
    openDaysBefore,
    openAt,
    eventDay,
  };
}

export async function getReservationFixedPrice(
  placeId: string,
  ymd: string
): Promise<number> {
  const eventDay = await getEventDayConfig(placeId, ymd);

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
  const eventDay = await getEventDayConfig(placeId, ymd);

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