export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

// 課金は一切しない。サブスクから customer と請求可能な PM が引けるかだけ確認する診断用。
// 使い方: GET /api/admin/monthly-offer-charge-check?secret=<CRON_SECRET>&contractId=<id>
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? "";
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const contractId = (req.nextUrl.searchParams.get("contractId") ?? "").trim();
  if (!contractId) {
    return NextResponse.json({ ok: false, error: "contractId required" }, { status: 400 });
  }

  try {
    const contract = await prisma.monthlyContract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        status: true,
        stripeSubscriptionId: true,
        tenant: { select: { email: true, stripeCustomerId: true } },
      },
    });
    if (!contract) {
      return NextResponse.json({ ok: false, error: "contract not found" }, { status: 404 });
    }

    const result: Record<string, unknown> = {
      contractId: contract.id,
      contractStatus: contract.status,
      tenantEmail: contract.tenant?.email ?? null,
      tenantStripeCustomerId: contract.tenant?.stripeCustomerId ?? null,
      stripeSubscriptionId: contract.stripeSubscriptionId ?? null,
    };

    const subId = contract.stripeSubscriptionId;
    if (!subId) {
      return NextResponse.json({
        ok: true,
        chargeReady: false,
        reason: "no_subscription_id",
        ...result,
      });
    }

    const sub = (await stripe.subscriptions.retrieve(subId, {
      expand: ["default_payment_method"],
    })) as Stripe.Subscription;

    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;

    let pmFromSub: string | null = null;
    if (sub.default_payment_method) {
      pmFromSub =
        typeof sub.default_payment_method === "string"
          ? sub.default_payment_method
          : sub.default_payment_method.id;
    }

    // サブスクに無ければ customer の既定PMを見る
    let pmFromCustomer: string | null = null;
    if (!pmFromSub && customerId) {
      const cust = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
      const dp = cust.invoice_settings?.default_payment_method;
      pmFromCustomer = typeof dp === "string" ? dp : dp?.id ?? null;
    }

    const usablePm = pmFromSub ?? pmFromCustomer ?? null;

    return NextResponse.json({
      ok: true,
      chargeReady: Boolean(customerId && usablePm),
      subStatus: sub.status,
      customerId,
      defaultPmFromSub: pmFromSub,
      defaultPmFromCustomer: pmFromCustomer,
      usablePaymentMethod: usablePm,
      ...result,
    });
  } catch (error) {
    console.error("[monthly-offer-charge-check] error:", error);
    return NextResponse.json(
      { ok: false, error: "stripe_error", detail: String(error) },
      { status: 500 }
    );
  }
}
