export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { resolveActivePlace } from "@/lib/place-resolver";

type StatusFilter = "ALL" | "IN" | "OUT" | "RESERVATION_ONLY";

function isStatusFilter(value: string): value is StatusFilter {
  return (
    value === "ALL" ||
    value === "IN" ||
    value === "OUT" ||
    value === "RESERVATION_ONLY"
  );
}

function normalizeYmd(input: string | null): string {
  const value = String(input ?? "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return "";
}

function jstStartOfDay(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

function jstEndOfDay(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+09:00`);
}

export async function GET(req: NextRequest) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const url = new URL(req.url);

    const inputPlaceId = String(url.searchParams.get("placeId") ?? "").trim();
    const inputPlaceSlug = String(url.searchParams.get("placeSlug") ?? "").trim();
    const startDate = normalizeYmd(url.searchParams.get("startDate"));
    const endDate = normalizeYmd(url.searchParams.get("endDate"));
    const statusParam = String(
      url.searchParams.get("status") ?? "ALL"
    ).trim().toUpperCase();
    const status: StatusFilter = isStatusFilter(statusParam) ? statusParam : "ALL";
    const q = String(url.searchParams.get("q") ?? "").trim();

    const place = await resolveActivePlace({
      placeId: inputPlaceId,
      placeSlug: inputPlaceSlug,
    });

    if (!place) {
      return NextResponse.json(
        {
          ok: false,
          error: "place_not_found",
          message: "place が見つかりません",
        },
        { status: 404 }
      );
    }

    // --- Date filters (both optional; empty = unbounded on that side) ---
    const sessionDateFilter: Prisma.DateTimeFilter = {};
    if (startDate) sessionDateFilter.gte = jstStartOfDay(startDate);
    if (endDate) sessionDateFilter.lte = jstEndOfDay(endDate);
    const sessionDateWhere =
      Object.keys(sessionDateFilter).length > 0
        ? { checkInAt: sessionDateFilter }
        : {};

    // For Reservation.date (YYYY-MM-DD string), compare lexicographically.
    const reservationDateFilter: Prisma.StringFilter = {};
    if (startDate) reservationDateFilter.gte = startDate;
    if (endDate) reservationDateFilter.lte = endDate;
    const reservationDateWhere =
      Object.keys(reservationDateFilter).length > 0
        ? { date: reservationDateFilter }
        : {};

    const sessionSearchWhere = q
      ? {
          OR: [
            { plate: { contains: q, mode: "insensitive" as const } },
            { customerName: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
            { spot: { code: { contains: q, mode: "insensitive" as const } } },
            { spot: { label: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {};

    const reservationSearchWhere = q
      ? {
          OR: [
            { plate: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
            { slot: { contains: q, mode: "insensitive" as const } },
            { spot: { code: { contains: q, mode: "insensitive" as const } } },
            { spot: { label: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {};

    // --- Counts (always computed for badges) ---
    const baseSessionWhere: Prisma.ParkingSessionWhereInput = {
      placeId: place.id,
      ...sessionDateWhere,
      ...sessionSearchWhere,
    };

    const baseReservationOnlyWhere: Prisma.ReservationWhereInput = {
      placeId: place.id,
      paid: true,
      checkedIn: false,
      status: "CONFIRMED",
      ...reservationDateWhere,
      ...reservationSearchWhere,
    };

    const [inCount, outCount, reservationOnlyCount] = await Promise.all([
      prisma.parkingSession.count({
        where: { ...baseSessionWhere, status: "IN" },
      }),
      prisma.parkingSession.count({
        where: { ...baseSessionWhere, status: "OUT" },
      }),
      prisma.reservation.count({ where: baseReservationOnlyWhere }),
    ]);

    const total = inCount + outCount + reservationOnlyCount;

    // --- Item list based on selected status ---
    type Row = {
      id: string;
      sessionType: "RESERVATION" | "HOURLY";
      plate: string | null;
      phone: string | null;
      customerName: string | null;
      paid: boolean;
      paidAt: Date | string | null;
      paymentRef: string | null;
      totalMinutes: number | null;
      totalYen: number | null;
      checkInAt: Date | string | null;
      checkOutAt: Date | string | null;
      status: "IN" | "OUT" | "RESERVATION_ONLY";
      createdAt: Date | string;
      spot: { id: string; code: string; label: string | null } | null;
      reservation: {
        id: string;
        date: string;
        slot: string;
        name: string;
      } | null;
    };

    let items: Row[] = [];

    if (status === "RESERVATION_ONLY") {
      const reservations = await prisma.reservation.findMany({
        where: baseReservationOnlyWhere,
        include: {
          spot: { select: { id: true, code: true, label: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      });

      items = reservations.map((r) => ({
        id: `r-${r.id}`,
        sessionType: "RESERVATION",
        plate: r.plate,
        phone: r.phone,
        customerName: r.name,
        paid: r.paid,
        paidAt: r.paidAt,
        paymentRef: r.paymentRef,
        totalMinutes: null,
        totalYen: r.price,
        checkInAt: null,
        checkOutAt: null,
        status: "RESERVATION_ONLY",
        createdAt: r.createdAt,
        spot: r.spot,
        reservation: {
          id: r.id,
          date: r.date,
          slot: r.slot,
          name: r.name,
        },
      }));
    } else {
      const sessionStatusWhere: Prisma.ParkingSessionWhereInput =
        status === "IN"
          ? { status: "IN" }
          : status === "OUT"
          ? { status: "OUT" }
          : {};

      const sessions = await prisma.parkingSession.findMany({
        where: { ...baseSessionWhere, ...sessionStatusWhere },
        include: {
          spot: { select: { id: true, code: true, label: true } },
          reservation: {
            select: { id: true, date: true, slot: true, name: true },
          },
        },
        orderBy: [{ checkInAt: "desc" }],
      });

      items = sessions.map((s) => ({
        id: s.id,
        sessionType: s.sessionType as "RESERVATION" | "HOURLY",
        plate: s.plate,
        phone: s.phone,
        customerName: s.customerName,
        paid: s.paid,
        paidAt: s.paidAt,
        paymentRef: s.paymentRef,
        totalMinutes: s.totalMinutes,
        totalYen: s.totalYen,
        checkInAt: s.checkInAt,
        checkOutAt: s.checkOutAt,
        status: s.status as "IN" | "OUT",
        createdAt: s.createdAt,
        spot: s.spot,
        reservation: s.reservation
          ? {
              id: s.reservation.id,
              date:
                typeof s.reservation.date === "string"
                  ? s.reservation.date
                  : (s.reservation.date as Date).toISOString().slice(0, 10),
              slot: s.reservation.slot,
              name: s.reservation.name,
            }
          : null,
      }));
    }

    return NextResponse.json({
      ok: true,
      place: {
        id: place.id,
        slug: place.slug,
        name: place.name,
        address: place.address,
      },
      filters: {
        startDate,
        endDate,
        status,
        q,
      },
      summary: {
        total,
        inCount,
        outCount,
        reservationOnlyCount,
      },
      sessions: items,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("GET /api/admin/parking-sessions error:", e);
    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}
