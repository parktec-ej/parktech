import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

function normalizeDate(input: string) {
  if (!input) return input;
  if (/^\d{8}$/.test(input)) {
    return `${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6, 8)}`;
  }
  return input;
}

function ymdTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function getReservationStatus(r: {
  paid: boolean;
  checkedIn: boolean;
  checkedOutAt: Date | null;
}) {
  if (r.checkedOutAt) return "CHECKED_OUT" as const;
  if (r.checkedIn) return "CHECKED_IN" as const;
  if (r.paid) return "RESERVED" as const;
  return "UNPAID" as const;
}

function slotParts(slot: string) {
  const m = String(slot ?? "").toUpperCase().match(/^([A-Z]+)-?(\d+)$/);
  if (!m) return { prefix: String(slot ?? ""), num: 0 };
  return { prefix: m[1], num: Number(m[2]) };
}

function compareSlot(a: string, b: string) {
  const aa = slotParts(a);
  const bb = slotParts(b);

  const prefixCmp = aa.prefix.localeCompare(bb.prefix, "ja");
  if (prefixCmp !== 0) return prefixCmp;
  return aa.num - bb.num;
}

export async function GET(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const placeId = String(url.searchParams.get("placeId") ?? "").trim();
    const date = normalizeDate(String(url.searchParams.get("date") ?? ymdTodayJst()).trim());
    const status = String(url.searchParams.get("status") ?? "ALL").trim();
    const q = String(url.searchParams.get("q") ?? "").trim();
    const sort = String(url.searchParams.get("sort") ?? "slot_asc").trim();

    if (!placeId) {
      return NextResponse.json({ ok: false, error: "place_id_required" }, { status: 400 });
    }

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        slug: true,
        name: true,
        address: true,
      },
    });

    if (!place) {
      return NextResponse.json({ ok: false, error: "place_not_found" }, { status: 404 });
    }

    const reservations = await prisma.reservation.findMany({
      where: {
        placeId,
        date,
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        date: true,
        slot: true,
        name: true,
        plate: true,
        email: true,
        price: true,
        pin: true,
        paid: true,
        paidAt: true,
        checkedIn: true,
        checkedInAt: true,
        checkedOutAt: true,
        createdAt: true,
        spotId: true,
        qrToken: true,
        spot: {
          select: {
            id: true,
            code: true,
            label: true,
          },
        },
      },
    });

    let items = reservations.map((r) => ({
      id: r.id,
      date: r.date,
      slot: r.slot,
      customerName: r.name,
      plate: r.plate,
      email: r.email,
      price: r.price,
      pin: r.pin,
      paid: r.paid,
      paidAt: r.paidAt,
      checkedIn: r.checkedIn,
      checkedInAt: r.checkedInAt,
      checkedOutAt: r.checkedOutAt,
      createdAt: r.createdAt,
      spotId: r.spotId,
      qrToken: r.qrToken,
      status: getReservationStatus(r),
      spot: r.spot
        ? {
            id: r.spot.id,
            code: r.spot.code,
            label: r.spot.label,
          }
        : null,
    }));

    if (q) {
      const qq = q.toLowerCase();
      items = items.filter((x) =>
        [
          x.slot,
          x.customerName,
          x.plate,
          x.email ?? "",
          x.spot?.code ?? "",
          x.spot?.label ?? "",
        ].some((v) => String(v).toLowerCase().includes(qq))
      );
    }

    if (status !== "ALL") {
      items = items.filter((x) => x.status === status);
    }

    items.sort((a, b) => {
      switch (sort) {
        case "slot_desc":
          return compareSlot(b.slot, a.slot);
        case "created_asc":
          return +new Date(a.createdAt) - +new Date(b.createdAt);
        case "created_desc":
          return +new Date(b.createdAt) - +new Date(a.createdAt);
        case "price_desc":
          return b.price - a.price;
        case "price_asc":
          return a.price - b.price;
        case "status":
          return String(a.status).localeCompare(String(b.status), "ja");
        case "slot_asc":
        default:
          return compareSlot(a.slot, b.slot);
      }
    });

    return NextResponse.json({
      ok: true,
      place,
      date,
      filters: {
        status,
        q,
        sort,
      },
      summary: {
        total: items.length,
        unpaid: items.filter((x) => x.status === "UNPAID").length,
        reserved: items.filter((x) => x.status === "RESERVED").length,
        checkedIn: items.filter((x) => x.status === "CHECKED_IN").length,
        checkedOut: items.filter((x) => x.status === "CHECKED_OUT").length,
      },
      reservations: items,
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
