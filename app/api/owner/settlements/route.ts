export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOwnerSession } from "@/lib/owner-auth";

export async function GET() {
  const owner = await getOwnerSession();
  if (!owner) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const settlements = await prisma.settlement.findMany({
    where: {
      ownerId: owner.id,
      status: { in: ["PAID", "LOCKED"] },
    },
    include: {
      Place: {
        select: { name: true, slug: true },
      },
      Payout: {
        where: { payoutTarget: "OWNER" },
        select: {
          status: true,
          actualAmount: true,
          executedAt: true,
          stripeTransferId: true,
        },
      },
    },
    orderBy: { month: "desc" },
  });

  return NextResponse.json({ ok: true, settlements });
}
