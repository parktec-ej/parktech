export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

function jsonError(error: string, status = 400, message?: string) {
  return NextResponse.json(
    { ok: false, error, ...(message ? { message } : {}) },
    { status }
  );
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);

  try {
    const { id } = await context.params;

    const settlement = await prisma.settlement.findUnique({
      where: { id },
      include: {
        Owner: {
          select: {
            id: true,
            name: true,
            displayName: true,
            email: true,
            phone: true,
            postalCode: true,
            address1: true,
            address2: true,
            invoiceNo: true,
            bankName: true,
            bankBranchName: true,
            bankAccountType: true,
            bankAccountNo: true,
            bankAccountName: true,
          },
        },
        Agent: {
          select: {
            id: true,
            name: true,
            displayName: true,
            email: true,
            phone: true,
            postalCode: true,
            address1: true,
            address2: true,
            invoiceNo: true,
            bankName: true,
            bankBranchName: true,
            bankAccountType: true,
            bankAccountNo: true,
            bankAccountName: true,
          },
        },
        Place: {
          select: {
            id: true,
            slug: true,
            name: true,
            address: true,
          },
        },
        SettlementItem: {
          include: {
            Payment: {
              select: {
                id: true,
                grossAmount: true,
                recognizedDate: true,
                serviceDate: true,
                spotLabelSnapshot: true,
                spotCodeSnapshot: true,
                customerNameSnapshot: true,
                plateSnapshot: true,
              },
            },
            Adjustment: {
              select: {
                id: true,
                kind: true,
                reason: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        Payout: {
          select: {
            id: true,
            payoutTarget: true,
            status: true,
            scheduledAmount: true,
            actualAmount: true,
            payoutFeeAmount: true,
            executedAt: true,
            stripeTransferId: true,
            note: true,
            failedReason: true,
          },
        },
      },
    });

    if (!settlement) return jsonError("settlement_not_found", 404);

    return NextResponse.json({ ok: true, settlement });
  } catch (error) {
    console.error("[admin/settlements/[id]/detail] error:", error);
    return jsonError(
      "server_error",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}
