export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

const PAGE_SIZE = 20;

function parseInt0(v: string | null, fallback: number) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseJstStartOfDay(ymd: string | null): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T00:00:00+09:00`);
}

function parseJstEndOfDay(ymd: string | null): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T23:59:59.999+09:00`);
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
    const sp = url.searchParams;

    const dateFrom = parseJstStartOfDay(sp.get("dateFrom"));
    const dateTo = parseJstEndOfDay(sp.get("dateTo"));
    const placeId = (sp.get("placeId") ?? "").trim();
    const customerName = (sp.get("customerName") ?? "").trim();
    const plate = (sp.get("plate") ?? "").trim();
    const phone = (sp.get("phone") ?? "").trim();
    const minAmount = sp.get("minAmount");
    const maxAmount = sp.get("maxAmount");
    const status = (sp.get("status") ?? "").trim();
    const page = Math.max(1, parseInt0(sp.get("page"), 1));

    const where: Prisma.PaymentWhereInput = {};
    const andConditions: Prisma.PaymentWhereInput[] = [];

    if (dateFrom || dateTo) {
      where.recognizedDate = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    if (placeId) {
      where.placeId = placeId;
    }

    if (minAmount !== null && minAmount !== "") {
      const n = Number(minAmount);
      if (Number.isFinite(n))
        where.grossAmount = { ...(where.grossAmount as object), gte: n };
    }
    if (maxAmount !== null && maxAmount !== "") {
      const n = Number(maxAmount);
      if (Number.isFinite(n))
        where.grossAmount = { ...(where.grossAmount as object), lte: n };
    }

    if (status === "completed") {
      where.refunded = false;
      where.status = { in: ["CONFIRMED", "SETTLED"] };
    } else if (status === "refunded") {
      where.refunded = true;
    } else if (status === "canceled") {
      andConditions.push({
        Reservation: { is: { status: "CANCELED" } },
      });
    }

    if (customerName) {
      andConditions.push({
        OR: [
          { customerNameSnapshot: { contains: customerName, mode: "insensitive" } },
          { Reservation: { is: { name: { contains: customerName, mode: "insensitive" } } } },
          { ParkingSession: { is: { customerName: { contains: customerName, mode: "insensitive" } } } },
        ],
      });
    }

    if (plate) {
      andConditions.push({
        OR: [
          { plateSnapshot: { contains: plate, mode: "insensitive" } },
          { Reservation: { is: { plate: { contains: plate, mode: "insensitive" } } } },
          { ParkingSession: { is: { plate: { contains: plate, mode: "insensitive" } } } },
        ],
      });
    }

    if (phone) {
      andConditions.push({
        OR: [
          { Reservation: { is: { phone: { contains: phone } } } },
          { ParkingSession: { is: { phone: { contains: phone } } } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [total, payments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: { recognizedDate: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          Reservation: {
            select: {
              id: true,
              email: true,
              phone: true,
              name: true,
              plate: true,
              date: true,
              slot: true,
              status: true,
            },
          },
          ParkingSession: {
            select: {
              id: true,
              phone: true,
              customerName: true,
              plate: true,
              checkInAt: true,
              checkOutAt: true,
            },
          },
        },
      }),
    ]);

    const items = payments.map((p) => {
      const email =
        p.Reservation?.email ?? null;
      const phoneOut =
        p.Reservation?.phone ?? p.ParkingSession?.phone ?? null;
      const customer =
        p.customerNameSnapshot ??
        p.Reservation?.name ??
        p.ParkingSession?.customerName ??
        null;
      const plateOut =
        p.plateSnapshot ??
        p.Reservation?.plate ??
        p.ParkingSession?.plate ??
        null;
      const useDate =
        p.serviceDate ??
        p.Reservation?.date ??
        (p.ParkingSession?.checkInAt
          ? p.ParkingSession.checkInAt
              .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
          : null);

      const displayStatus = p.refunded
        ? "返金"
        : p.Reservation?.status === "CANCELED"
        ? "キャンセル"
        : "完了";

      return {
        id: p.id,
        paymentRef: p.paymentRef,
        recognizedDate: p.recognizedDate,
        kind: p.kind,
        status: p.status,
        refunded: p.refunded,
        displayStatus,
        placeName: p.placeNameSnapshot,
        spotLabel: p.spotLabelSnapshot ?? p.spotCodeSnapshot ?? null,
        customerName: customer,
        plate: plateOut,
        email,
        phone: phoneOut,
        useDate,
        grossAmount: p.grossAmount,
      };
    });

    return NextResponse.json({
      ok: true,
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      items,
    });
  } catch (error) {
    console.error("[admin/payments][GET] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
