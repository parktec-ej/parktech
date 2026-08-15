export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getAdminSession } from "@/lib/admin-auth";
import { getReservationFixedPrice } from "@/lib/pricing-core";
import { sendOfferApplicantPaymentMail } from "@/lib/mail";
import { sendSlackNotification } from "@/lib/slack";
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

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const offerId = String(body?.offerId ?? "").trim();
    if (!offerId) {
      return NextResponse.json(
        { ok: false, error: "offer_id_required" },
        { status: 400 }
      );
    }

    const offer = await prisma.eventMonthlyOffer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        placeId: true,
        spotId: true,
        date: true,
        status: true,
        applicantName: true,
        applicantEmail: true,
        applicantPhone: true,
        applicantPlate: true,
        applicantCheckoutSession: true,
        applicantReservationId: true,
      },
    });
    if (!offer) {
      return NextResponse.json({ ok: false, error: "offer_not_found" }, { status: 404 });
    }

    // --- 前提条件（すべて満たす場合のみ実行。満たさなければ 409）---
    if (offer.status !== "RELEASED") {
      return NextResponse.json({ ok: false, error: "not_released" }, { status: 409 });
    }
    if (offer.applicantReservationId != null) {
      return NextResponse.json({ ok: false, error: "already_applied" }, { status: 409 });
    }
    if (!offer.applicantEmail) {
      return NextResponse.json({ ok: false, error: "no_applicant_email" }, { status: 409 });
    }

    const place = await prisma.place.findUnique({
      where: { id: offer.placeId },
      select: { id: true, name: true },
    });
    if (!place) {
      return NextResponse.json({ ok: false, error: "place_not_found" }, { status: 404 });
    }

    const spot = await prisma.spot.findFirst({
      where: { id: offer.spotId, placeId: place.id, isActive: true },
      select: { id: true, code: true, label: true },
    });
    if (!spot) {
      return NextResponse.json({ ok: false, error: "spot_not_found" }, { status: 409 });
    }

    // その区画×日付に確定予約があれば再送不可
    const reserved = await prisma.reservation.findFirst({
      where: { spotId: offer.spotId, date: offer.date, status: "CONFIRMED" },
      select: { id: true },
    });
    if (reserved) {
      return NextResponse.json({ ok: false, error: "already_reserved" }, { status: 409 });
    }

    // 締切超過チェック（イベント日 - DEADLINE_DAYS を過ぎていないこと）
    const deadline = ymdPlusDays(offer.date, -MONTHLY_EVENT_OFFER_DEADLINE_DAYS);
    if (ymdTodayJst() > deadline) {
      return NextResponse.json({ ok: false, error: "past_deadline" }, { status: 409 });
    }

    // --- 有効期限：now+24h と イベント日前日23:59(JST) の早いほう ---
    const now = Date.now();
    const prevYmd = ymdPlusDays(offer.date, -1);
    const eventPrevNight = new Date(`${prevYmd}T23:59:00+09:00`).getTime();
    const expiresMs = Math.min(now + DAY_MS, eventPrevNight);
    // Stripe の expires_at は now+30分〜now+24時間の範囲のみ許容。収まらなければ拒否。
    if (expiresMs < now + HALF_HOUR_MS || expiresMs > now + DAY_MS) {
      return NextResponse.json({ ok: false, error: "no_valid_window" }, { status: 409 });
    }
    const expiresAtUnix = Math.floor(expiresMs / 1000);

    const price = await getReservationFixedPrice(place.id, offer.date);
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ ok: false, error: "price_unavailable" }, { status: 409 });
    }

    // 旧 Checkout セッションを明示的に失効させる。
    // 既に expired / complete の場合はエラーを握りつぶして続行する。
    if (offer.applicantCheckoutSession) {
      try {
        await stripe.checkout.sessions.expire(offer.applicantCheckoutSession);
      } catch (e) {
        console.error(
          "[monthly-offers/resend] expire old session failed (ignored):",
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
      return NextResponse.json(
        { ok: false, error: "checkout_create_failed" },
        { status: 502 }
      );
    }

    await prisma.eventMonthlyOffer.update({
      where: { id: offer.id },
      data: {
        applicantCheckoutSession: checkout.id,
        expiresAt: new Date(expiresMs),
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
      console.error("[monthly-offers/resend] applicant payment mail failed:", e);
    }

    await sendSlackNotification(
      `【管理・再送】${place.name} ${spot.label ?? spot.code} / ${offer.date} の決済リンクを申請者(${offer.applicantEmail})へ再送しました。有効期限: ${new Date(
        expiresMs
      ).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`
    ).catch(() => {});

    return NextResponse.json({
      ok: true,
      offerId: offer.id,
      checkoutSession: checkout.id,
      expiresAt: new Date(expiresMs).toISOString(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[monthly-offers/resend] error:", e);
    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}
