import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { resolveActivePlace } from "@/lib/place-resolver";

type SessionStatus = "IN" | "OUT";

type ParkingSessionItem = {
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
    date: string;
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

    const rawStatus = String(url.searchParams.get("status") ?? "ALL")
      .trim()
      .toUpperCase();

    const status: SessionStatus | undefined =
      rawStatus === "IN" || rawStatus === "OUT"
        ? (rawStatus as SessionStatus)
        : undefined;

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

    const sessions: ParkingSessionItem[] = await prisma.parkingSession.findMany({
      where: {
        placeId: place.id,
        checkInAt: {
          gte: start,
          lte: end,
        },
        ...(status ? { status } : {}),
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
        status: rawStatus,
        q,
      },
      summary: {
        total: sessions.length,
        inCount: sessions.filter((x: ParkingSessionItem) => x.status === "IN")
          .length,
        outCount: sessions.filter((x: ParkingSessionItem) => x.status === "OUT")
          .length,
      },
      sessions: sessions.map((s: ParkingSessionItem) => ({
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