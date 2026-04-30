export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { resolveActivePlace } from "@/lib/place-resolver";

type SessionStatus = "IN" | "OUT";

type ParkingSessionRow = {
  id: string;
  sessionType: string;
  plate: string | null;
  phone: string | null;
  customerName: string | null;
  paid: boolean;
  paidAt: Date | null;
  paymentRef: string | null;
  totalMinutes: number | null;
  totalYen: number | null;
  checkInAt: Date;
  checkOutAt: Date | null;
  status: string;
  createdAt: Date;
  spot: {
    id: string;
    code: string;
    label: string | null;
  } | null;
  reservation: {
    id: string;
    date: Date;
    slot: string;
    name: string;
  } | null;
};

function normalizeDate(input: string) {
  const value = String(input ?? "").trim();
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  return value;
}

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

function isSessionStatus(value: string): value is SessionStatus {
  return value === "IN" || value === "OUT";
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
    const date = normalizeDate(url.searchParams.get("date") || ymdTodayJst());
    const statusParam = String(
      url.searchParams.get("status") ?? "ALL"
    ).trim().toUpperCase();
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

    const start = new Date(`${date}T00:00:00+09:00`);
    const end = new Date(`${date}T23:59:59.999+09:00`);

    const statusWhere =
      statusParam !== "ALL" && isSessionStatus(statusParam)
        ? { status: statusParam }
        : {};

    const sessions = await prisma.parkingSession.findMany({
      where: {
        placeId: place.id,
        checkInAt: {
          gte: start,
          lte: end,
        },
        ...statusWhere,
        ...(q
          ? {
              OR: [
                { plate: { contains: q, mode: "insensitive" } },
                { customerName: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
                { spot: { code: { contains: q, mode: "insensitive" } } },
                { spot: { label: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        spot: {
          select: {
            id: true,
            code: true,
            label: true,
          },
        },
        reservation: {
          select: {
            id: true,
            date: true,
            slot: true,
            name: true,
          },
        },
      },
      orderBy: [{ checkInAt: "desc" }],
    });

    const rows = sessions as ParkingSessionRow[];

    return NextResponse.json({
      ok: true,
      place: {
        id: place.id,
        slug: place.slug,
        name: place.name,
        address: place.address,
      },
      date,
      filters: {
        status: statusParam,
        q,
      },
      summary: {
        total: rows.length,
        inCount: rows.filter((x: ParkingSessionRow) => x.status === "IN")
          .length,
        outCount: rows.filter((x: ParkingSessionRow) => x.status === "OUT")
          .length,
      },
      sessions: rows.map((s: ParkingSessionRow) => ({
        id: s.id,
        sessionType: s.sessionType,
        plate: s.plate,
        phone: s.phone ?? null,
        customerName: s.customerName ?? null,
        paid: s.paid,
        paidAt: s.paidAt,
        paymentRef: s.paymentRef,
        totalMinutes: s.totalMinutes,
        totalYen: s.totalYen,
        checkInAt: s.checkInAt,
        checkOutAt: s.checkOutAt,
        status: s.status,
        createdAt: s.createdAt,
        spot: s.spot,
        reservation: s.reservation,
      })),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);

    console.error("GET /api/admin/parking-sessions error:", e);

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message,
      },
      { status: 500 }
    );
  }
}