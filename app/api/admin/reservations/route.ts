export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

type ReservationStatus =
  | "CHECKED_OUT"
  | "CHECKED_IN"
  | "RESERVED"
  | "UNPAID"
  | "CANCELED";

type ReservationRow = {
  id: string;
  date: Date | string;
  slot: string;
  name: string;
  plate: string;
  email: string | null;
  phone: string | null;
  price: number;
  pin: string | null;
  paid: boolean;
  paidAt: Date | null;
  checkedIn: boolean;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  unexitNoticeSentAt: Date | null;
  unexitAckAt: Date | null;
  selfCheckedOut: boolean;
  createdAt: Date;
  spotId: string | null;
  qrToken: string | null;
  status: string;
  canceledAt: Date | null;
  spot: {
    id: string;
    code: string;
    label: string | null;
  } | null;
  changeLogs: {
    id: string;
    oldDate: string;
    newDate: string;
    changedAt: Date;
    changedBy: string;
    reason: string | null;
  }[];
};

type ReservationItem = {
  id: string;
  date: Date | string;
  slot: string;
  customerName: string;
  plate: string;
  email: string | null;
  phone: string | null;
  price: number;
  pin: string | null;
  paid: boolean;
  paidAt: Date | null;
  checkedIn: boolean;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  unexitNoticeSentAt: Date | null;
  unexitAckAt: Date | null;
  selfCheckedOut: boolean;
  createdAt: Date;
  spotId: string | null;
  qrToken: string | null;
  status: ReservationStatus;
  spot: {
    id: string;
    code: string;
    label: string | null;
  } | null;
  changeLogs: {
    id: string;
    oldDate: string;
    newDate: string;
    changedAt: Date;
    changedBy: string;
    reason: string | null;
  }[];
};

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
  status: string;
}): ReservationStatus {
  if (r.status === "CANCELED") return "CANCELED";
  if (r.checkedOutAt) return "CHECKED_OUT";
  if (r.checkedIn) return "CHECKED_IN";
  if (r.paid) return "RESERVED";
  return "UNPAID";
}

function slotParts(slot: string) {
  const m = String(slot ?? "").toUpperCase().match(/^([A-Z]+)-?(\d+)$/);

  if (!m) {
    return { prefix: String(slot ?? ""), num: 0 };
  }

  return { prefix: m[1], num: Number(m[2]) };
}

function compareSlot(a: string, b: string) {
  const aa = slotParts(a);
  const bb = slotParts(b);

  const prefixCmp = aa.prefix.localeCompare(bb.prefix, "ja");

  if (prefixCmp !== 0) {
    return prefixCmp;
  }

  return aa.num - bb.num;
}

export async function GET(req: Request) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const url = new URL(req.url);

    const placeId = String(url.searchParams.get("placeId") ?? "").trim();
    const rawDate = String(url.searchParams.get("date") ?? ymdTodayJst()).trim();
    const isAllDates = rawDate.toUpperCase() === "ALL" || rawDate === "";
    const date = isAllDates ? "" : normalizeDate(rawDate);
    const status = String(url.searchParams.get("status") ?? "ALL").trim();
    const q = String(url.searchParams.get("q") ?? "").trim();
    const sort = String(url.searchParams.get("sort") ?? "slot_asc").trim();

    if (!placeId) {
      return NextResponse.json(
        { ok: false, error: "place_id_required" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { ok: false, error: "place_not_found" },
        { status: 404 }
      );
    }

    const reservations = await prisma.reservation.findMany({
      where: isAllDates ? { placeId } : { placeId, date },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        date: true,
        slot: true,
        name: true,
        plate: true,
        email: true,
        phone: true,
        price: true,
        pin: true,
        paid: true,
        paidAt: true,
        checkedIn: true,
        checkedInAt: true,
        checkedOutAt: true,
        unexitNoticeSentAt: true,
        unexitAckAt: true,
        selfCheckedOut: true,
        createdAt: true,
        spotId: true,
        qrToken: true,
        status: true,
        canceledAt: true,
        spot: {
          select: {
            id: true,
            code: true,
            label: true,
          },
        },
        changeLogs: {
          select: {
            id: true,
            oldDate: true,
            newDate: true,
            changedAt: true,
            changedBy: true,
            reason: true,
          },
          orderBy: { changedAt: "desc" as const },
        },
      },
    });

    const reservationRows = reservations as ReservationRow[];

    let items: ReservationItem[] = reservationRows.map((r: ReservationRow) => ({
      id: r.id,
      date: r.date,
      slot: r.slot,
      customerName: r.name,
      plate: r.plate,
      email: r.email,
      phone: r.phone,
      price: r.price,
      pin: r.pin,
      paid: r.paid,
      paidAt: r.paidAt,
      checkedIn: r.checkedIn,
      checkedInAt: r.checkedInAt,
      checkedOutAt: r.checkedOutAt,
      unexitNoticeSentAt: r.unexitNoticeSentAt,
      unexitAckAt: r.unexitAckAt,
      selfCheckedOut: r.selfCheckedOut,
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
      changeLogs: r.changeLogs ?? [],
    }));

    if (q) {
      const qq = q.toLowerCase();

      items = items.filter((x: ReservationItem) =>
        [
          x.slot,
          x.customerName,
          x.plate,
          x.email ?? "",
          x.phone ?? "",
          x.spot?.code ?? "",
          x.spot?.label ?? "",
        ].some((v: string) => String(v).toLowerCase().includes(qq))
      );
    }

    if (status === "ALL") {
      // 既定ではキャンセル済みを一覧から除外する。
      // キャンセル済みを見たいときは status=CANCELED を明示指定する。
      items = items.filter((x: ReservationItem) => x.status !== "CANCELED");
    } else {
      items = items.filter((x: ReservationItem) => x.status === status);
    }

    items.sort((a: ReservationItem, b: ReservationItem) => {
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
      date: isAllDates ? "ALL" : date,
      filters: {
        status,
        q,
        sort,
      },
      summary: {
        total: items.length,
        unpaid: items.filter((x: ReservationItem) => x.status === "UNPAID")
          .length,
        reserved: items.filter((x: ReservationItem) => x.status === "RESERVED")
          .length,
        checkedIn: items.filter(
          (x: ReservationItem) => x.status === "CHECKED_IN"
        ).length,
        checkedOut: items.filter(
          (x: ReservationItem) => x.status === "CHECKED_OUT"
        ).length,
        canceled: items.filter(
          (x: ReservationItem) => x.status === "CANCELED"
        ).length,
      },
      reservations: items,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);

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