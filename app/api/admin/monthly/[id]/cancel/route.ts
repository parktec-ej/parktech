export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getAdminSession } from "@/lib/admin-auth";
import { sendMonthlyContractCanceledMail } from "@/lib/mail";
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
      include: { tenant: true, place: true },
    });
    if (!contract) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (contract.status !== "ACTIVE" && contract.status !== "PAST_DUE") {
      return NextResponse.json(
        { ok: false, error: "invalid_status", message: `現在のステータス: ${contract.status}` },
        { status: 409 }
      );
    }

    // 月払いサブスクはキャンセル（前払いは返金なし＝Stripe操作なし）
    if (contract.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(contract.stripeSubscriptionId);
      } catch (e) {
        console.error("stripe subscription cancel failed:", e);
        return NextResponse.json(
          { ok: false, message: "Stripeサブスクのキャンセルに失敗しました。Stripe管理画面を確認してください。" },
          { status: 502 }
        );
      }
    }

    await prisma.monthlyContract.update({
      where: { id },
      data: { status: "CANCELED", canceledAt: new Date() },
    });

    try {
      await sendMonthlyContractCanceledMail({
        to: contract.tenant.email,
        name: contract.tenant.name,
        placeName: contract.place.name,
      });
    } catch (e) {
      console.error("monthly canceled mail failed:", e);
    }

    try {
      await sendSlackNotification(
        `🛑 月極解約実行: ${contract.tenant.name} 様 / ${contract.place.name} (operator: ${admin.email})`
      );
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/monthly/cancel] error:", error);
    return NextResponse.json(
      { ok: false, error: "server_error", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
