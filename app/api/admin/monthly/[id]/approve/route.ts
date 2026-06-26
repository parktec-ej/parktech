export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getAdminSession } from "@/lib/admin-auth";
import { sendMonthlyPaymentLinkMail } from "@/lib/mail";
import { sendSlackNotification } from "@/lib/slack";

const PLAN_LABEL: Record<string, string> = {
  NON_EVENT_ONLY: "プラン1：非イベント日のみ",
  INCLUDES_EVENT: "プラン2：イベント日も駐車可（都度予約）",
};

const TERM_LABEL = "月額（毎月3,300円・自動継続）";

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
    if (contract.status !== "PENDING") {
      return NextResponse.json(
        { ok: false, error: "invalid_status", message: `現在のステータス: ${contract.status}` },
        { status: 409 }
      );
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
    // サブスク一本化: 常に月額サブスクリプション（¥3,300/月・自動継続）
    const monthlyFeeYen = contract.baseFeeYen; // 新規契約は 3300
    const productName = `${contract.place.name} 月極駐車場（${TERM_LABEL}）`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: contract.tenant.email,
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: { name: productName },
            unit_amount: monthlyFeeYen,
            recurring: { interval: "month" as const },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/monthly/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/monthly/apply`,
      metadata: { flow: "monthly_contract", contractId: contract.id },
      subscription_data: {
        metadata: { flow: "monthly_contract", contractId: contract.id },
      },
    });

    await prisma.monthlyContract.update({
      where: { id: contract.id },
      data: {
        status: "AWAITING_PAYMENT",
        approvedAt: new Date(),
        stripeCheckoutSession: session.id,
      },
    });

    try {
      await sendMonthlyPaymentLinkMail({
        to: contract.tenant.email,
        name: contract.tenant.name,
        placeName: contract.place.name,
        planLabel: PLAN_LABEL[contract.plan] ?? contract.plan,
        termLabel: TERM_LABEL,
        totalFeeYen: monthlyFeeYen,
        isSubscription: true,
        checkoutUrl: session.url!,
      });
    } catch (e) {
      console.error("monthly payment link mail failed:", e);
    }

    try {
      await sendSlackNotification(
        `✅ 月極承認: ${contract.tenant.name} 様 / ${contract.place.name} / 月額¥${monthlyFeeYen.toLocaleString("ja-JP")}（自動継続） → 支払いリンク送信 (operator: ${admin.email})`
      );
    } catch {}

    return NextResponse.json({ ok: true, checkoutUrl: session.url });
  } catch (error) {
    console.error("[admin/monthly/approve] error:", error);
    return NextResponse.json(
      { ok: false, error: "server_error", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
