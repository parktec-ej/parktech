import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type CancellationReservationRow = {
  id: string;
  date: string;
  slot: string;
  placeId: string | null;
  name: string;
  plate: string;
  price: number;
  status: string;
  refundStatus: string | null;
  refundAmount: number | null;
  canceledAt: Date | null;
  createdAt: Date;
  place: {
    id: string;
    name: string;
  } | null;
  spot: {
    id: string;
    code: string;
    label: string | null;
  } | null;
  Payments: Array<{
    id: string;
    paymentRef: string | null;
    paymentIntentId: string | null;
    grossAmount: number;
    refunded: boolean;
    createdAt: Date;
    Adjustments: Array<{
      id: string;
      kind: string;
      status: string;
      grossDeltaAmount: number;
      recognizedMonth: string;
      reason: string;
      note: string | null;
      createdAt: Date;
    }>;
  }>;
};

type CancellationItem = {
  id: string;
  date: string;
  slot: string;
  placeName: string;
  spotLabel: string;
  name: string;
  plate: string;
  price: number;
  status: string;
  refundStatus: string | null;
  refundAmount: number;
  canceledAt: Date | null;
  canceledAtJst: string | null;
  createdAt: Date;
  createdAtJst: string | null;
  payment: {
    id: string;
    paymentRef: string | null;
    paymentIntentId: string | null;
    grossAmount: number;
    refunded: boolean;
    createdAt: Date;
    createdAtJst: string | null;
  } | null;
  adjustment: {
    id: string;
    kind: string;
    status: string;
    grossDeltaAmount: number;
    recognizedMonth: string;
    reason: string;
    note: string | null;
    createdAt: Date;
    createdAtJst: string | null;
  } | null;
};

function toJst(isoLike: Date | string | null | undefined) {
  if (!isoLike) return null;

  const d = isoLike instanceof Date ? isoLike : new Date(isoLike);

  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const status = String(url.searchParams.get("status") ?? "all").trim();
    const month = String(url.searchParams.get("month") ?? "").trim();
    const limitParam = Number(url.searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 500)
      : 200;

    const where: any = {
      status: "CANCELED",
    };

    if (/^\d{4}-\d{2}$/.test(month)) {
      where.date = {
        startsWith: month,
      };
    }

    if (
      status !== "all" &&
      status !== "SUCCEEDED" &&
      status !== "FAILED" &&
      status !== "NOT_REQUIRED" &&
      status !== "NONE" &&
      status !== "PENDING"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_status",
          message: "status が不正です",
        },
        { status: 400 }
      );
    }

    if (status !== "all") {
      where.refundStatus = status;
    }

  const reservations =
  (await prisma.reservation.findMany({
    where,
    orderBy: [{ canceledAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      place: {
        select: {
          id: true,
          name: true,
        },
      },
      spot: {
        select: {
          id: true,
          code: true,
          label: true,
        },
      },
      Payment: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          paymentRef: true,
          paymentIntentId: true,
          grossAmount: true,
          refunded: true,
          createdAt: true,
          Adjustment: {
            orderBy: {
              createdAt: "desc",
            },
            select: {
              id: true,
              kind: true,
              status: true,
              grossDeltaAmount: true,
              recognizedMonth: true,
              reason: true,
              note: true,
              createdAt: true,
            },
          },
        },
      },
    },
  })) as unknown as CancellationReservationRow[];

    const rows: CancellationItem[] = reservations.map(
      (r: CancellationReservationRow) => {
        const payment = r.Payments[0] ?? null;
        const latestAdjustment = payment?.Adjustments?.[0] ?? null;

        return {
          id: r.id,
          date: r.date,
          slot: r.slot,
          placeName: r.place?.name ?? r.placeId ?? "-",
          spotLabel: r.spot?.label ?? r.spot?.code ?? r.slot,
          name: r.name,
          plate: r.plate,
          price: r.price,
          status: r.status,
          refundStatus: r.refundStatus,
          refundAmount: r.refundAmount ?? 0,
          canceledAt: r.canceledAt,
          canceledAtJst: toJst(r.canceledAt),
          createdAt: r.createdAt,
          createdAtJst: toJst(r.createdAt),
          payment: payment
            ? {
                id: payment.id,
                paymentRef: payment.paymentRef,
                paymentIntentId: payment.paymentIntentId,
                grossAmount: payment.grossAmount,
                refunded: payment.refunded,
                createdAt: payment.createdAt,
                createdAtJst: toJst(payment.createdAt),
              }
            : null,
          adjustment: latestAdjustment
            ? {
                id: latestAdjustment.id,
                kind: latestAdjustment.kind,
                status: latestAdjustment.status,
                grossDeltaAmount: latestAdjustment.grossDeltaAmount,
                recognizedMonth: latestAdjustment.recognizedMonth,
                reason: latestAdjustment.reason,
                note: latestAdjustment.note,
                createdAt: latestAdjustment.createdAt,
                createdAtJst: toJst(latestAdjustment.createdAt),
              }
            : null,
        };
      }
    );

    const summary = {
      total: rows.length,
      succeeded: rows.filter((x: CancellationItem) => x.refundStatus === "SUCCEEDED")
        .length,
      failed: rows.filter((x: CancellationItem) => x.refundStatus === "FAILED")
        .length,
      notRequired: rows.filter(
        (x: CancellationItem) => x.refundStatus === "NOT_REQUIRED"
      ).length,
      pending: rows.filter((x: CancellationItem) => x.refundStatus === "PENDING")
        .length,
      none: rows.filter((x: CancellationItem) => x.refundStatus === "NONE").length,
      refundTotal: rows.reduce(
        (sum: number, x: CancellationItem) => sum + (x.refundAmount ?? 0),
        0
      ),
    };

    return NextResponse.json({
      ok: true,
      month: month || null,
      filterStatus: status,
      summary,
      items: rows,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: "キャンセル一覧の取得に失敗しました",
      },
      { status: 500 }
    );
  }
}