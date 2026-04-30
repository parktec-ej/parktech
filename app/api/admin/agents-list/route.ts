export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const agents = await prisma.agent.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      displayName: true,
      defaultAgentRateBps: true,
      status: true,
    },
    orderBy: [{ registeredAt: "asc" }],
  });

  return NextResponse.json({ ok: true, agents });
}