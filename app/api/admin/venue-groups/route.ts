export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  const groups = await prisma.venueGroup.findMany({
    include: { parkings: true },
    orderBy: { id: "asc" },
  });
  return NextResponse.json({ ok: true, venueGroups: groups });
}
