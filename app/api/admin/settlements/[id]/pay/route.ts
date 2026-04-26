import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

type SettlementItemRow = {
  paymentId: string | null;
};

type SettlementPayoutRow = {
  id: string;
  payoutTarget: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    const settlement = await prisma.settlement.findUnique({
      where: { id },
      include: {
        items: {
          select: {
            paymentId: true,
          },
        },
        payouts: {
          select: {
            id: true,
            payoutTarget: true,
          },
        },
      },
    });

    if (!settlement) {
      return NextResponse.json(
        { ok: false, error: "settlement_not_found" },
        { status: 404 }
      );
    }

    if (settlement.status === "PAID") {
      return NextResponse.redirect(
        new URL(
          `/admin/settlements?month=${encodeURIComponent(
            settlement.month
          )}&paid=1`,
          req.url
        ),
        { status: 303 }
      );
    }

    const paymentIds = (settlement.items as SettlementItemRow[])
      .map((x: SettlementItemRow) => x.paymentId)
      .filter((x: string | null): x is string => Boolean(x));

    const now = new Date();

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const payouts = settlement.payouts as SettlementPayoutRow[];

      const hasOwnerPayout = payouts.some(
        (p: SettlementPayoutRow) => p.payoutTarget === "OWNER"
      );

      const hasAgentPayout = payouts.some(
        (p: SettlementPayoutRow) => p.payoutTarget === "AGENT"
      );

      if (!hasOwnerPayout && settlement.finalOwnerPayoutAmount > 0) {
        await tx.payout.create({
          data: {
            settlementId: settlement.id,
            placeId: settlement.placeId ?? null,
            ownerId: settlement.ownerId,
            agentId: null,
            payoutTarget: "OWNER",
            status: "PAID",
            scheduledAmount: settlement.finalOwnerPayoutAmount,
            payoutFeeAmount: 0,
            actualAmount: settlement.finalOwnerPayoutAmount,
            approvedAt: now,
            executedAt: now,
            note: `Manual payout by ${admin.email}`,
          },
        });
      }

      if (
        settlement.agentId &&
        settlement.finalAgentPayoutAmount > 0 &&
        !hasAgentPayout
      ) {
        await tx.payout.create({
          data: {
            settlementId: settlement.id,
            placeId: settlement.placeId ?? null,
            ownerId: settlement.ownerId,
            agentId: settlement.agentId,
            payoutTarget: "AGENT",
            status: "PAID",
            scheduledAmount: settlement.finalAgentPayoutAmount,
            payoutFeeAmount: 0,
            actualAmount: settlement.finalAgentPayoutAmount,
            approvedAt: now,
            executedAt: now,
            note: `Manual payout by ${admin.email}`,
          },
        });
      }

      await tx.settlement.update({
        where: { id: settlement.id },
        data: {
          status: "PAID",
          paidAt: now,
        },
      });

      if (paymentIds.length > 0) {
        await tx.payment.updateMany({
          where: {
            id: {
              in: paymentIds,
            },
          },
          data: {
            status: "SETTLED",
            settlementLock: "LOCKED",
            settledAt: now,
          },
        });
      }
    });

    return NextResponse.redirect(
      new URL(
        `/admin/settlements?month=${encodeURIComponent(
          settlement.month
        )}&paid=1`,
        req.url
      ),
      { status: 303 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);

    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}