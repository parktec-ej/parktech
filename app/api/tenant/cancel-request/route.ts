export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenantSession } from "@/lib/tenant-auth";
import { sendSlackNotification } from "@/lib/slack";

export async function POST() {
  const session = await getTenantSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const contract = await prisma.monthlyContract.findFirst({
      where: { tenantId: session.tenantId, status: { in: ["ACTIVE", "PAST_DUE"] } },
      include: { place: true },
      orderBy: { createdAt: "desc" },
    });
    if (!contract) {
      return NextResponse.json({ ok: false, message: "解約可能な契約がありません。" }, { status: 404 });
    }
    if (contract.cancelRequestedAt) {
      return NextResponse.json({ ok: true, alreadyRequested: true });
    }
    await prisma.monthlyContract.update({
      where: { id: contract.id },
      data: { cancelRequestedAt: new Date() },
    });
    try {
      await sendSlackNotification(
        `📩 月極解約申請: ${session.name} 様 (${session.email}) / ${contract.place.name} — 管理画面から解約実行してください`
      );
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[tenant/cancel-request] error:", error);
    return NextResponse.json({ ok: false, message: "申請に失敗しました。" }, { status: 500 });
  }
}
