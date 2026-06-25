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
const TERM_LABEL: Record<string, string> = {
  MONTHLY: "月払い（毎月3,000円・自動継続）",
  QUARTERLY: "3ヶ月一括前払い",
  SEMIANNUAL: "半年一括前払い",
  ANNUAL: "1年一括前払い（10%割引）",
};

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
    const isSubscription = contract.billingTerm === "MONTHLY";
    const productName = `${contract.place.name} 月極駐車場（${TERM_LABEL[contract.billingTerm] ?? contract.billingTerm}）`;

    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? "subscription" : "payment",
      payment_method_types: ["card"],
      customer_email: contract.tenant.email,
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: { name: productName },
            unit_amount: isSubscription ? contract.baseFeeYen : contract.totalFeeYen,
            ...(isSubscription ? { recurring: { interval: "month" as const } } : {}),
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/monthly/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/monthly/apply`,
      metadata: { flow: "monthly_contract", contractId: contract.id },
      ...(isSubscription
        ? { subscription_data: { metadata: { flow: "monthly_contract", contractId: contract.id } } }
        : {}),
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
        termLabel: TERM_LABEL[contract.billingTerm] ?? contract.billingTerm,
        totalFeeYen: isSubscription ? contract.baseFeeYen : contract.totalFeeYen,
        isSubscription,
        checkoutUrl: session.url!,
      });
    } catch (e) {
      console.error("monthly payment link mail failed:", e);
    }

    try {
      await sendSlackNotification(
        `✅ 月極承認: ${contract.tenant.name} 様 / ${contract.place.name} / ${TERM_LABEL[contract.billingTerm] ?? contract.billingTerm} → 支払いリンク送信 (operator: ${admin.email})`
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
