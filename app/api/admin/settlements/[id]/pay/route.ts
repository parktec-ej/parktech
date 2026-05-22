import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

type TransferResult = {
  stripeTransferId: string | null;
  status: "PAID" | "FAILED";
  failedReason: string | null;
  note: string;
};

async function transferToConnectAccount(params: {
  amount: number;
  destination: string;
  description: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}): Promise<TransferResult> {
  try {
    const transfer = await stripe.transfers.create(
      {
        amount: params.amount,
        currency: "jpy",
        destination: params.destination,
        description: params.description,
        metadata: params.metadata,
      },
      { idempotencyKey: params.idempotencyKey }
    );
    return {
      stripeTransferId: transfer.id,
      status: "PAID",
      failedReason: null,
      note: `Stripe Transfer: ${transfer.id}`,
    };
  } catch (e: any) {
    return {
      stripeTransferId: null,
      status: "FAILED",
      failedReason: e?.message || String(e),
      note: `Stripe Transfer failed: ${e?.message || String(e)}`,
    };
  }
}

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
        SettlementItem: {
          select: {
            paymentId: true,
          },
        },
        Payout: {
          select: {
            id: true,
            payoutTarget: true,
            status: true,
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

    const paymentIds = settlement.SettlementItem.map((x) => x.paymentId).filter(
      (x): x is string => Boolean(x)
    );

    const hasOwnerPayout = settlement.Payout.some(
      (p) => p.payoutTarget === "OWNER" && p.status === "PAID"
    );
    const hasAgentPayout = settlement.Payout.some(
      (p) => p.payoutTarget === "AGENT" && p.status === "PAID"
    );

    const failedOwnerPayoutIds = settlement.Payout.filter(
      (p) => p.payoutTarget === "OWNER" && p.status === "FAILED"
    ).map((p) => p.id);
    const failedAgentPayoutIds = settlement.Payout.filter(
      (p) => p.payoutTarget === "AGENT" && p.status === "FAILED"
    ).map((p) => p.id);

    // --- Stripe Transfer は DB トランザクション外で実行 ---
    // 1. Owner / Agent の Stripe 情報を取得
    const owner = await prisma.owner.findUnique({
      where: { id: settlement.ownerId },
      select: { stripeAccountId: true, stripeOnboardingComplete: true },
    });

    const agent = settlement.agentId
      ? await prisma.agent.findUnique({
          where: { id: settlement.agentId },
          select: { stripeAccountId: true, stripeOnboardingComplete: true },
        })
      : null;

    // 2. Owner Transfer
    let ownerResult: TransferResult = {
      stripeTransferId: null,
      status: "PAID",
      failedReason: null,
      note: `Manual payout by ${admin.email}`,
    };

    const shouldCreateOwnerPayout =
      !hasOwnerPayout && settlement.finalOwnerPayoutAmount > 0;

    if (
      shouldCreateOwnerPayout &&
      owner?.stripeAccountId &&
      owner?.stripeOnboardingComplete
    ) {
      ownerResult = await transferToConnectAccount({
        amount: settlement.finalOwnerPayoutAmount,
        destination: owner.stripeAccountId,
        description: `精算 ${settlement.month} - ${settlement.placeId}`,
        metadata: {
          settlementId: settlement.id,
          month: settlement.month,
          ownerId: settlement.ownerId,
          payoutTarget: "OWNER",
        },
        idempotencyKey: `settlement-${settlement.id}-OWNER`,
      });
    } else if (
      shouldCreateOwnerPayout &&
      !owner?.stripeAccountId
    ) {
      ownerResult.note = `Manual payout - no Stripe account (by ${admin.email})`;
    }

    // 3. Agent Transfer
    let agentResult: TransferResult = {
      stripeTransferId: null,
      status: "PAID",
      failedReason: null,
      note: `Manual payout by ${admin.email}`,
    };

    const shouldCreateAgentPayout =
      !hasAgentPayout &&
      Boolean(settlement.agentId) &&
      settlement.finalAgentPayoutAmount > 0;

    if (
      shouldCreateAgentPayout &&
      agent?.stripeAccountId &&
      agent?.stripeOnboardingComplete
    ) {
      agentResult = await transferToConnectAccount({
        amount: settlement.finalAgentPayoutAmount,
        destination: agent.stripeAccountId,
        description: `精算 ${settlement.month} - ${settlement.placeId} (Agent)`,
        metadata: {
          settlementId: settlement.id,
          month: settlement.month,
          ownerId: settlement.ownerId,
          agentId: settlement.agentId ?? "",
          payoutTarget: "AGENT",
        },
        idempotencyKey: `settlement-${settlement.id}-AGENT`,
      });
    } else if (shouldCreateAgentPayout && !agent?.stripeAccountId) {
      agentResult.note = `Manual payout - no Stripe account (by ${admin.email})`;
    }

    // --- DB トランザクションで Payout / Settlement / Payment を更新 ---
    const now = new Date();
    const allTransfersSucceeded =
      (!shouldCreateOwnerPayout || ownerResult.status === "PAID") &&
      (!shouldCreateAgentPayout || agentResult.status === "PAID");

    await prisma.$transaction(async (tx) => {
      if (shouldCreateOwnerPayout) {
        // 既存の FAILED Payout を削除してから新しい Payout を作成
        if (failedOwnerPayoutIds.length > 0) {
          await tx.payout.deleteMany({
            where: { id: { in: failedOwnerPayoutIds } },
          });
        }
        await tx.payout.create({
          data: {
            id: crypto.randomUUID(),
            settlementId: settlement.id,
            placeId: settlement.placeId ?? null,
            ownerId: settlement.ownerId,
            agentId: null,
            payoutTarget: "OWNER",
            status: ownerResult.status,
            scheduledAmount: settlement.finalOwnerPayoutAmount,
            payoutFeeAmount: 0,
            actualAmount: settlement.finalOwnerPayoutAmount,
            approvedAt: now,
            executedAt: ownerResult.status === "PAID" ? now : null,
            stripeTransferId: ownerResult.stripeTransferId,
            failedReason: ownerResult.failedReason,
            note: ownerResult.note,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      if (shouldCreateAgentPayout && settlement.agentId) {
        // 既存の FAILED Payout を削除してから新しい Payout を作成
        if (failedAgentPayoutIds.length > 0) {
          await tx.payout.deleteMany({
            where: { id: { in: failedAgentPayoutIds } },
          });
        }
        await tx.payout.create({
          data: {
            id: crypto.randomUUID(),
            settlementId: settlement.id,
            placeId: settlement.placeId ?? null,
            ownerId: settlement.ownerId,
            agentId: settlement.agentId,
            payoutTarget: "AGENT",
            status: agentResult.status,
            scheduledAmount: settlement.finalAgentPayoutAmount,
            payoutFeeAmount: 0,
            actualAmount: settlement.finalAgentPayoutAmount,
            approvedAt: now,
            executedAt: agentResult.status === "PAID" ? now : null,
            stripeTransferId: agentResult.stripeTransferId,
            failedReason: agentResult.failedReason,
            note: agentResult.note,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      // すべて成功した場合のみ Settlement を PAID に。
      // いずれか FAILED の場合は LOCKED のまま（失敗理由は Payout.failedReason に記録済）
      if (allTransfersSucceeded) {
        await tx.settlement.update({
          where: { id: settlement.id },
          data: {
            status: "PAID",
            paidAt: now,
            updatedAt: now,
          },
        });

        if (paymentIds.length > 0) {
          await tx.payment.updateMany({
            where: { id: { in: paymentIds } },
            data: {
              status: "SETTLED",
              settlementLock: "LOCKED",
              settledAt: now,
              updatedAt: now,
            },
          });
        }
      }
    });

    const qsParams = new URLSearchParams({
      month: settlement.month,
    });
    if (allTransfersSucceeded) {
      qsParams.set("paid", "1");
    } else {
      qsParams.set("partial", "1");
    }

    return NextResponse.redirect(
      new URL(`/admin/settlements?${qsParams.toString()}`, req.url),
      { status: 303 }
    );
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
