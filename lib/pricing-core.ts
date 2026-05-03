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
      dailyYenOverride: true,
      busFixedYen: true,
      reservationOpenDaysBefore: true,
    },
  });
}

export async function isReservationOpen(placeId: string, ymd: string) {
  const eventDay = await getEventDayConfig(placeId, ymd);

  if (!eventDay) {
    return {
      ok: true,
      openDaysBefore: 0,
      openAt: null,
      eventDay: null,
    };
  }

  const openDaysBefore = Number(eventDay.reservationOpenDaysBefore ?? 0);

  // 0日は常時予約可
  if (openDaysBefore <= 0) {
    return {
      ok: true,
      openDaysBefore: 0,
      openAt: null,
      eventDay,
    };
  }

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

export async function getBusReservationFixedPrice(
  placeId: string,
  ymd: string
): Promise<number> {
  const eventDay = await getEventDayConfig(placeId, ymd);

  if (eventDay?.busFixedYen != null) {
    return eventDay.busFixedYen;
  }

  const normal = await getReservationFixedPrice(placeId, ymd);
  return normal;
}

export async function getDailyRate(
  placeId: string,
  ymd: string
): Promise<number | null> {
  const eventDay = await getEventDayConfig(placeId, ymd);

  if (eventDay?.dailyYenOverride != null) {
    return eventDay.dailyYenOverride;
  }

  const rule = await prisma.pricingRule.findFirst({
    where: {
      placeId,
      pricingType: "HOURLY",
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
    select: {
      dailyYen: true,
    },
  });

  return rule?.dailyYen ?? null;
}

export function calcHourlyFee(
  totalMinutes: number,
  hourlyYen: number,
  dailyYen: number | null
): number {
  const totalHours = Math.ceil(totalMinutes / 60);
  if (!dailyYen) {
    return totalHours * hourlyYen;
  }
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  const remainingFee = Math.min(remainingHours * hourlyYen, dailyYen);
  return days * dailyYen + remainingFee;
}