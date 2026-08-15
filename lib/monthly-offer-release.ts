import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getReservationFixedPrice } from "@/lib/pricing-core";
import { sendOfferApplicantPaymentMail } from "@/lib/mail";
import { MONTHLY_EVENT_OFFER_DEADLINE_DAYS } from "@/lib/monthly-config";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
const HALF_HOUR_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function ymdTodayJst() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}
function ymdToUtc(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function ymdPlusDays(ymd: string, days: number) {
  const d = ymdToUtc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type ReleaseOfferResult =
  | { ok: true; checkoutSessionId: string; expiresAt: string }
  | { ok: false; error: string };

/**
 * オファーを申請者へリリース（＝決済リンクを発行）する共通処理。
 *
 * 事前検証 → 旧 Checkout Session の失効 → 価格再計算 → 新 Checkout Session 作成
 * → offer 更新（applicantCheckoutSession / expiresAt / status="RELEASED" / releasedBy）
 * → 申請者への決済案内メール送信、までを担う。
 *
 * Slack 通知は呼び出し側（再送・代理リリース・cron で文面が変わる）の責務とし、
 * この関数には含めない。
 *
 * @param offerId    対象 EventMonthlyOffer の id
 * @param releasedBy リリースの実行主体（例: "ADMIN"）。offer.releasedBy に保存する。
 */
export async function releaseOfferToApplicant(
  offerId: string,
  releasedBy: string
): Promise<ReleaseOfferResult> {
  const offer = await prisma.eventMonthlyOffer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      placeId: true,
      spotId: true,
      date: true,
      applicantName: true,
      applicantEmail: true,
      applicantPhone: true,
      applicantPlate: true,
      applicantCheckoutSession: true,
    },
  });
  if (!offer) return { ok: false, error: "offer_not_found" };
  if (!offer.applicantEmail) return { ok: false, error: "no_applicant_email" };

  const place = await prisma.place.findUnique({
    where: { id: offer.placeId },
    select: { id: true, name: true },
  });
  if (!place) return { ok: false, error: "place_not_found" };

  const spot = await prisma.spot.findFirst({
    where: { id: offer.spotId, placeId: place.id, isActive: true },
    select: { id: true, code: true, label: true },
  });
  if (!spot) return { ok: false, error: "spot_not_found" };

  // その区画×日付に確定予約があればリリース不可
  const reserved = await prisma.reservation.findFirst({
    where: { spotId: offer.spotId, date: offer.date, status: "CONFIRMED" },
    select: { id: true },
  });
  if (reserved) return { ok: false, error: "already_reserved" };

  // 締切超過チェック（イベント日 - DEADLINE_DAYS を過ぎていないこと）
  const deadline = ymdPlusDays(offer.date, -MONTHLY_EVENT_OFFER_DEADLINE_DAYS);
  if (ymdTodayJst() > deadline) return { ok: false, error: "past_deadline" };

  // --- 有効期限：now+24h と イベント日前日23:59(JST) の早いほう ---
  const now = Date.now();
  const prevYmd = ymdPlusDays(offer.date, -1);
  const eventPrevNight = new Date(`${prevYmd}T23:59:00+09:00`).getTime();
  const expiresMs = Math.min(now + DAY_MS, eventPrevNight);
  // Stripe の expires_at は now+30分〜now+24時間の範囲のみ許容。収まらなければ拒否。
  if (expiresMs < now + HALF_HOUR_MS || expiresMs > now + DAY_MS) {
    return { ok: false, error: "no_valid_window" };
  }
  const expiresAtUnix = Math.floor(expiresMs / 1000);

  const price = await getReservationFixedPrice(place.id, offer.date);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "price_unavailable" };
  }

  // 旧 Checkout セッションを明示的に失効させる。
  // 既に expired / complete の場合はエラーを握りつぶして続行する。
  if (offer.applicantCheckoutSession) {
    try {
      await stripe.checkout.sessions.expire(offer.applicantCheckoutSession);
    } catch (e) {
      console.error(
        "[monthly-offer-release] expire old session failed (ignored):",
        e
      );
    }
  }

  // 新規 Checkout Session。metadata は
  // app/api/tenant/event-response/offer-decline/route.ts の POST と完全一致。
  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: offer.applicantEmail,
    expires_at: expiresAtUnix,
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: {
            name: `${place.name} ${spot.label ?? spot.code} イベント日予約`,
            description: `${offer.date} / ${spot.label ?? spot.code}`,
          },
          unit_amount: price,
        },
        quantity: 1,
      },
    ],
    success_url: `${APP_URL}/reserve/success?offer=1`,
    cancel_url: `${APP_URL}/reserve`,
    metadata: {
      flow: "reservation",
      placeId: place.id,
      spotId: spot.id,
      slot: spot.code,
      date: offer.date,
      name: offer.applicantName ?? "",
      plate: offer.applicantPlate ?? "",
      email: offer.applicantEmail,
      phone: offer.applicantPhone ?? "",
      price: String(price),
      offerId: offer.id,
    },
  });

  if (!checkout.url) {
    return { ok: false, error: "checkout_create_failed" };
  }

  await prisma.eventMonthlyOffer.update({
    where: { id: offer.id },
    data: {
      applicantCheckoutSession: checkout.id,
      expiresAt: new Date(expiresMs),
      status: "RELEASED",
      releasedBy,
    },
  });

  try {
    await sendOfferApplicantPaymentMail({
      to: offer.applicantEmail,
      name: offer.applicantName ?? "",
      placeName: place.name,
      spotLabel: spot.label ?? spot.code,
      date: offer.date,
      priceYen: price,
      checkoutUrl: checkout.url,
    });
  } catch (e) {
    console.error("[monthly-offer-release] applicant payment mail failed:", e);
  }

  return {
    ok: true,
    checkoutSessionId: checkout.id,
    expiresAt: new Date(expiresMs).toISOString(),
  };
}
