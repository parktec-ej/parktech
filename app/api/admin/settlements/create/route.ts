export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

async function readPostBody(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await req.json();

    return {
      month: typeof body?.month === "string" ? body.month : "",
      placeId: typeof body?.placeId === "string" ? body.placeId : "",
    };
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const fd = await req.formData();

    return {
      month: String(fd.get("month") ?? ""),
      placeId: String(fd.get("placeId") ?? ""),
    };
  }

  return { month: "", placeId: "" };
}

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const { month, placeId } = await readPostBody(req);

    if (!month || !placeId) {
      return NextResponse.json(
        { ok: false, error: "missing_params" },
        { status: 400 }
      );
    }

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        ownerId: true,
      },
    });

    if (!place || !place.ownerId) {
      return NextResponse.json(
        { ok: false, error: "place_not_found" },
        { status: 404 }
      );
    }

    const ownerId = place.ownerId;

    const existing = await prisma.settlement.findFirst({
      where: {
        month,
        placeId,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return NextResponse.redirect(
        new URL(
          `/admin/settlements?placeId=${encodeURIComponent(
            placeId
          )}&month=${encodeURIComponent(month)}&exists=1`,
          req.url
        ),
        { status: 303 }
      );
    }

    const payments = await prisma.payment.findMany({
      where: {
        placeId,
        recognizedMonth: month,
        status: {
          in: ["CONFIRMED", "SETTLED"],
        },
        excludedFromSettlement: false,
      },
    });

    if (payments.length === 0) {
      return NextResponse.redirect(
        new URL(
          `/admin/settlements?placeId=${encodeURIComponent(
            placeId
          )}&month=${encodeURIComponent(month)}&empty=1`,
          req.url
        ),
        { status: 303 }
      );
    }

    const now = new Date();

    // Payment スナップショット（ownerRateBps/agentRateBps/platformRateBps から
    // 確定した owner/agent/platformAmount）を唯一の正とし、Settlement は Payment
    // 集計から算出する。固定20%モデル（calcSettlementTotals）は使用しない。
    const grossTotal = payments.reduce((sum, p) => sum + p.grossAmount, 0);

    const totalOwnerAmount = payments.reduce(
      (sum, p) => sum + p.ownerAmount,
      0
    );

    const totalAgentAmount = payments.reduce(
      (sum, p) => sum + (p.agentAmount ?? 0),
      0
    );

    const totalPlatformAmount = payments.reduce(
      (sum, p) => sum + p.platformAmount,
      0
    );

    // 税抜/消費税の内訳（売上総額ベース。料率非依存の表示用）
    const totalNet = Math.floor(grossTotal / 1.1);
    const totalTax = grossTotal - totalNet;

    // プラットフォーム手数料 = Payment 集計の platform 実額（料率準拠）
    const platformGross = totalPlatformAmount;
    const platformNet = Math.floor(platformGross / 1.1);
    const platformTax = platformGross - platformNet;

    // オーナー純額 = Payment 集計の owner 実額（料率準拠）。100%プラットフォーム
    // なら 0、owner80/agent10/platform10 なら gross×80% 等、スナップショットに一致。
    const ownerPayout = totalOwnerAmount;

    const settlement = await prisma.$transaction(async (tx) => {
      const createdSettlement = await tx.settlement.create({
        data: {
          id: crypto.randomUUID(),

          month,
          placeId,
          ownerId,
          agentId: null,

          status: "LOCKED",
          lockedAt: now,

          paymentCount: payments.length,
          adjustmentCount: 0,

          totalGrossAmount: grossTotal,
          totalNetAmount: totalNet,
          totalTaxAmount: totalTax,

          platformFeeNet: platformNet,
          platformFeeTax: platformTax,
          platformFeeGross: platformGross,

          ownerPayoutAmount: ownerPayout,

          totalOwnerAmount,
          totalAgentAmount,
          totalPlatformAmount,

          finalOwnerPayoutAmount: ownerPayout,
          finalAgentPayoutAmount: totalAgentAmount,

          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.payment.updateMany({
        where: {
          id: {
            in: payments.map((p) => p.id),
          },
        },
        data: {
          status: "SETTLED",
          settlementLock: "LOCKED",
          settledAt: now,
          updatedAt: now,
        },
      });

      await tx.settlementItem.createMany({
        data: payments.map((p) => ({
          id: crypto.randomUUID(),

          settlementId: createdSettlement.id,
          paymentId: p.id,
          itemType: "PAYMENT",

          grossAmount: p.grossAmount,
          ownerAmount: p.ownerAmount,
          agentAmount: p.agentAmount ?? 0,
          platformAmount: p.platformAmount,

          createdAt: now,
        })),
      });

      return createdSettlement;
    });

    return NextResponse.redirect(
      new URL(
        `/admin/settlements?placeId=${encodeURIComponent(
          placeId
        )}&month=${encodeURIComponent(month)}&created=1&id=${encodeURIComponent(
          settlement.id
        )}`,
        req.url
      ),
      { status: 303 }
    );
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}