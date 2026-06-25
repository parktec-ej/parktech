export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { sendSlackNotification } from "@/lib/slack";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const contract = await prisma.monthlyContract.findUnique({
      where: { id },
      include: { tenant: true },
    });
    if (!contract) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (contract.status !== "PENDING") {
      return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 409 });
    }
    await prisma.monthlyContract.update({
      where: { id },
      data: { status: "REJECTED", canceledAt: new Date() },
    });
    try {
      await sendSlackNotification(`🚫 月極却下: ${contract.tenant.email} (operator: ${admin.email})`);
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/monthly/reject] error:", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
