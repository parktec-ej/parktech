export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePartner } from "@/lib/partner-auth";

export async function GET() {
  try {
    await requirePartner();

    const partners = await prisma.busPartner.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        companyPhone: true,
        address: true,
        contact: true,
        phone: true,
        email: true,
      },
    });

    return NextResponse.json({ ok: true, partners });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}
