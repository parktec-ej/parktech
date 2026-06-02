export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import type { Prisma, AdjustmentKind } from "@prisma/client";
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

    // 返金の正準は REFUND系 Adjustment（締め後は Payment.refunded を立てないため、
    // refunded フラグだけでなく Adjustment 存在も見て判定する）。
    const REFUND_KINDS: AdjustmentKind[] = ["REFUND_FULL", "REFUND_PARTIAL"];

    if (status === "completed") {
      where.status = { in: ["CONFIRMED", "SETTLED"] };
      andConditions.push({
        refunded: false,
        Adjustment: { none: { kind: { in: REFUND_KINDS } } },
      });
    } else if (status === "refunded") {
      andConditions.push({
        OR: [
          { refunded: true },
          { Adjustment: { some: { kind: { in: REFUND_KINDS } } } },
        ],
      });
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
          Adjustment: {
            where: { kind: { in: REFUND_KINDS } },
            select: { id: true },
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

      // 締め前は Payment.refunded、締め後は REFUND系 Adjustment の存在で返金判定
      const isRefunded = p.refunded || (p.Adjustment?.length ?? 0) > 0;

      const displayStatus = isRefunded
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
        refunded: isRefunded,
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
