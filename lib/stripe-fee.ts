import { stripe } from "@/lib/stripe";

/**
 * PaymentIntent から Stripe決済手数料と Charge ID を取得する。
 * 取得に失敗しても webhook 自体は失敗させない（0 を返す）。
 */
export async function fetchStripeFee(
  paymentIntentId: string | null
): Promise<{ fee: number; chargeId: string | null }> {
  if (!paymentIntentId) return { fee: 0, chargeId: null };

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });

    const charge = pi.latest_charge as any;
    if (!charge || typeof charge === "string") {
      return { fee: 0, chargeId: null };
    }

    const bt = charge.balance_transaction as any;
    const fee =
      bt && typeof bt === "object" && typeof bt.fee === "number" ? bt.fee : 0;

    return { fee, chargeId: charge.id ?? null };
  } catch (e) {
    console.error("[fetchStripeFee] failed:", paymentIntentId, e);
    return { fee: 0, chargeId: null };
  }
}
