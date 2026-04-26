import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type PaymentSummary = {
  count: number;
  grossAmount: number;
  ownerAmount: number;
  agentAmount: number;
  platformAmount: number;
};

type AdjustmentSummary = {
  count: number;
  grossDeltaAmount: number;
  ownerDeltaAmount: number;
  agentDeltaAmount: number;
  platformDeltaAmount: number;
};

type PaymentRow = {
  id: string;
  kind: string;
  status: string;
  recognizedMonth: string;
  recognizedDate: Date;
  serviceDate: Date | null;
  paymentRef: string | null;
  placeId: string;
  placeNameSnapshot: string;
  ownerId: string | null;
  ownerNameSnapshot: string | null;
  agentId: string | null;
  agentNameSnapshot: string | null;
  grossAmount: number;
  ownerAmount: number;
  agentAmount: number;
  platformAmount: number;
  refunded: boolean;
  customerNameSnapshot: string | null;
  plateSnapshot: string | null;
};

type AdjustmentRow = {
  id: string;
  paymentId: string;
  kind: string;
  status: string;
  recognizedMonth: string;
  recognizedDate: Date;
  grossDeltaAmount: number;
  ownerDeltaAmount: number;
  agentDeltaAmount: number;
  platformDeltaAmount: number;
  reason: string | null;
  note: string | null;
  createdAt: Date;
  payment: {
    id: string;
    kind: string;
    paymentRef: string | null;
    placeId: string;
    placeNameSnapshot: string;
    ownerId: string | null;
    ownerNameSnapshot: string | null;
    agentId: string | null;
    agentNameSnapshot: string | null;
  };
};

type ByPlaceRow = {
  placeId: string;
  placeName: string;
  paymentCount: number;
  adjustmentCount: number;
  grossAmount: number;
  grossDeltaAmount: number;
  netGrossAmount: number;
  ownerAmount: number;
  ownerDeltaAmount: number;
  netOwnerAmount: number;
  agentAmount: number;
  agentDeltaAmount: number;
  netAgentAmount: number;
  platformAmount: number;
  platformDeltaAmount: number;
  netPlatformAmount: number;
};

function isValidMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function currentMonth() {
  const d = new Date();
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const month = String(url.searchParams.get("month") ?? currentMonth()).trim();

    if (!isValidMonth(month)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_month",
          message: "month は YYYY-MM 形式で指定してください",
        },
        { status: 400 }
      );
    }

    const [paymentsRaw, adjustmentsRaw] = await Promise.all([
      prisma.payment.findMany({
        where: {
          recognizedMonth: month,
          status: {
            in: ["CONFIRMED", "REFUNDED", "SETTLED"],
          },
          excludedFromSettlement: false,
        },
        orderBy: [{ recognizedDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          kind: true,
          status: true,
          recognizedMonth: true,
          recognizedDate: true,
          serviceDate: true,
          paymentRef: true,
          placeId: true,
          placeNameSnapshot: true,
          ownerId: true,
          ownerNameSnapshot: true,
          agentId: true,
          agentNameSnapshot: true,
          grossAmount: true,
          ownerAmount: true,
          agentAmount: true,
          platformAmount: true,
          refunded: true,
          customerNameSnapshot: true,
          plateSnapshot: true,
        },
      }),

      prisma.adjustment.findMany({
        where: {
          recognizedMonth: month,
          status: {
            in: ["CONFIRMED", "SETTLED"],
          },
        },
        orderBy: [{ recognizedDate: "desc" }, { createdAt: "desc" }],
        include: {
          payment: {
            select: {
              id: true,
              kind: true,
              paymentRef: true,
              placeId: true,
              placeNameSnapshot: true,
              ownerId: true,
              ownerNameSnapshot: true,
              agentId: true,
              agentNameSnapshot: true,
            },
          },
        },
      }),
    ]);

    const payments = paymentsRaw as PaymentRow[];
    const adjustments = adjustmentsRaw as AdjustmentRow[];

    const paymentSummary = payments.reduce(
      (acc: PaymentSummary, p: PaymentRow) => {
        acc.count += 1;
        acc.grossAmount += p.grossAmount;
        acc.ownerAmount += p.ownerAmount;
        acc.agentAmount += p.agentAmount;
        acc.platformAmount += p.platformAmount;
        return acc;
      },
      {
        count: 0,
        grossAmount: 0,
        ownerAmount: 0,
        agentAmount: 0,
        platformAmount: 0,
      } as PaymentSummary
    );

    const adjustmentSummary = adjustments.reduce(
      (acc: AdjustmentSummary, a: AdjustmentRow) => {
        acc.count += 1;
        acc.grossDeltaAmount += a.grossDeltaAmount;
        acc.ownerDeltaAmount += a.ownerDeltaAmount;
        acc.agentDeltaAmount += a.agentDeltaAmount;
        acc.platformDeltaAmount += a.platformDeltaAmount;
        return acc;
      },
      {
        count: 0,
        grossDeltaAmount: 0,
        ownerDeltaAmount: 0,
        agentDeltaAmount: 0,
        platformDeltaAmount: 0,
      } as AdjustmentSummary
    );

    const netSummary = {
      netGrossAmount:
        paymentSummary.grossAmount + adjustmentSummary.grossDeltaAmount,
      netOwnerAmount:
        paymentSummary.ownerAmount + adjustmentSummary.ownerDeltaAmount,
      netAgentAmount:
        paymentSummary.agentAmount + adjustmentSummary.agentDeltaAmount,
      netPlatformAmount:
        paymentSummary.platformAmount + adjustmentSummary.platformDeltaAmount,
    };

    const byPlaceMap = new Map<string, ByPlaceRow>();

    for (const p of payments) {
      const key = p.placeId;

      if (!byPlaceMap.has(key)) {
        byPlaceMap.set(key, {
          placeId: p.placeId,
          placeName: p.placeNameSnapshot,
          paymentCount: 0,
          adjustmentCount: 0,
          grossAmount: 0,
          grossDeltaAmount: 0,
          netGrossAmount: 0,
          ownerAmount: 0,
          ownerDeltaAmount: 0,
          netOwnerAmount: 0,
          agentAmount: 0,
          agentDeltaAmount: 0,
          netAgentAmount: 0,
          platformAmount: 0,
          platformDeltaAmount: 0,
          netPlatformAmount: 0,
        });
      }

      const row = byPlaceMap.get(key);

      if (!row) continue;

      row.paymentCount += 1;
      row.grossAmount += p.grossAmount;
      row.ownerAmount += p.ownerAmount;
      row.agentAmount += p.agentAmount;
      row.platformAmount += p.platformAmount;
    }

    for (const a of adjustments) {
      const key = a.payment.placeId;

      if (!byPlaceMap.has(key)) {
        byPlaceMap.set(key, {
          placeId: a.payment.placeId,
          placeName: a.payment.placeNameSnapshot,
          paymentCount: 0,
          adjustmentCount: 0,
          grossAmount: 0,
          grossDeltaAmount: 0,
          netGrossAmount: 0,
          ownerAmount: 0,
          ownerDeltaAmount: 0,
          netOwnerAmount: 0,
          agentAmount: 0,
          agentDeltaAmount: 0,
          netAgentAmount: 0,
          platformAmount: 0,
          platformDeltaAmount: 0,
          netPlatformAmount: 0,
        });
      }

      const row = byPlaceMap.get(key);

      if (!row) continue;

      row.adjustmentCount += 1;
      row.grossDeltaAmount += a.grossDeltaAmount;
      row.ownerDeltaAmount += a.ownerDeltaAmount;
      row.agentDeltaAmount += a.agentDeltaAmount;
      row.platformDeltaAmount += a.platformDeltaAmount;
    }

    const byPlace = Array.from(byPlaceMap.values())
      .map((row: ByPlaceRow): ByPlaceRow => ({
        ...row,
        netGrossAmount: row.grossAmount + row.grossDeltaAmount,
        netOwnerAmount: row.ownerAmount + row.ownerDeltaAmount,
        netAgentAmount: row.agentAmount + row.agentDeltaAmount,
        netPlatformAmount: row.platformAmount + row.platformDeltaAmount,
      }))
      .sort((a: ByPlaceRow, b: ByPlaceRow) => {
        return b.netGrossAmount - a.netGrossAmount;
      });

    const recentPayments = payments.slice(0, 50);

    const recentAdjustments = adjustments.slice(0, 50).map((a: AdjustmentRow) => ({
      id: a.id,
      paymentId: a.paymentId,
      paymentRef: a.payment.paymentRef,
      placeName: a.payment.placeNameSnapshot,
      ownerName: a.payment.ownerNameSnapshot,
      agentName: a.payment.agentNameSnapshot,
      kind: a.kind,
      status: a.status,
      recognizedMonth: a.recognizedMonth,
      recognizedDate: a.recognizedDate,
      grossDeltaAmount: a.grossDeltaAmount,
      ownerDeltaAmount: a.ownerDeltaAmount,
      agentDeltaAmount: a.agentDeltaAmount,
      platformDeltaAmount: a.platformDeltaAmount,
      reason: a.reason,
      note: a.note,
      createdAt: a.createdAt,
    }));

    return NextResponse.json({
      ok: true,
      month,
      summary: {
        payments: paymentSummary,
        adjustments: adjustmentSummary,
        net: netSummary,
      },
      byPlace,
      recentPayments,
      recentAdjustments,
    });
  } catch (error: unknown) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: "月次集計の取得に失敗しました",
      },
      { status: 500 }
    );
  }
}