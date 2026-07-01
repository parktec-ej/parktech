export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { verifyEventToken } from "@/lib/event-token";
import { getReservationFixedPrice } from "@/lib/pricing-core";
import { sendOfferApplicantPaymentMail } from "@/lib/mail";
import { sendSlackNotification } from "@/lib/slack";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();

function htmlPage(inner: string) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:0 16px;line-height:1.8;color:#111">${inner}<p style="margin-top:16px"><a href="${APP_URL}/tenant/dashboard">契約者ページへ</a></p></div>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

// GET: 確認ページ（メールスキャナ誤クリック対策で確定はPOST）
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyEventToken(token);
  if (!payload || payload.a !== "offer_decline") {
    return htmlPage("<h2>リンクが無効です</h2><p>お手数ですがお問い合わせください。</p>");
  }
  return htmlPage(`
    <h2>この区画を利用希望者にお譲りしますか？</h2>
    <p>対象日: ${payload.d}</p>
    <p>「お譲りする」を確定すると、あなたはこの日この区画を利用できなくなり、利用希望者へお支払い案内が送られます（取り消せません）。</p>
    <form method="POST" action="${APP_URL}/api/tenant/event-response/offer-decline">
      <input type="hidden" name="token" value="${token}" />
      <button type="submit" style="background:#111;color:#fff;border:none;padding:12px 20px;border-radius:8px;font-weight:bold;cursor:pointer">お譲りするを確定する</button>
    </form>
  `);
}

// POST: 確定（RELEASED＋申請者へ決済リンク送付）
export async function POST(req: NextRequest) {
  let token = "";
  try {
    const form = await req.formData();
    token = String(form.get("token") ?? "");
  } catch {
    token = "";
  }
  const payload = verifyEventToken(token);
  if (!payload || payload.a !== "offer_decline") {
    return htmlPage("<h2>リンクが無効です</h2><p>お問い合わせください。</p>");
  }

  try {
    const contract = await prisma.monthlyContract.findUnique({
      where: { id: payload.c },
      include: { place: true, tenant: true },
    });
    if (!contract || !contract.spotId || !contract.place) {
      return htmlPage("<h2>受付できません</h2><p>契約が見つかりませんでした。</p>");
    }
    const place = contract.place;
    const date = payload.d;

    const offer = await prisma.eventMonthlyOffer.findUnique({
      where: { spotId_date: { spotId: contract.spotId, date } },
      select: {
        id: true,
        status: true,
        applicantName: true,
        applicantEmail: true,
        applicantPhone: true,
        applicantPlate: true,
      },
    });
    if (!offer) {
      return htmlPage("<h2>対象の申請が見つかりません</h2><p>受付が取り消された可能性があります。</p>");
    }
    if (offer.status !== "WAITING") {
      return htmlPage("<h2>既に受付済みです</h2><p>この申請は既に処理されています。</p>");
    }
    if (!offer.applicantEmail) {
      return htmlPage("<h2>申請者情報が不足しています</h2><p>お問い合わせください。</p>");
    }

    const spot = await prisma.spot.findFirst({
      where: { id: contract.spotId, placeId: place.id, isActive: true },
      select: { id: true, code: true, label: true },
    });
    if (!spot) return htmlPage("<h2>区画が見つかりません</h2><p></p>");

    // 二重確保防止：既にその区画に予約があれば譲渡不可
    const reserved = await prisma.reservation.findFirst({
      where: { spotId: spot.id, date, status: "CONFIRMED" },
      select: { id: true },
    });
    if (reserved) {
      return htmlPage("<h2>お譲りできません</h2><p>この日は既に予約が入っています。</p>");
    }

    const price = await getReservationFixedPrice(place.id, date);
    if (!Number.isFinite(price) || price <= 0) {
      return htmlPage("<h2>料金の計算に失敗しました</h2><p>お問い合わせください。</p>");
    }

    // 申請者向け決済Checkout（既存 flow="reservation" を流用＋offerId付与）
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: offer.applicantEmail,
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: {
              name: `${place.name} ${spot.label ?? spot.code} イベント日予約`,
              description: `${date} / ${spot.label ?? spot.code}`,
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
        date,
        name: offer.applicantName ?? "",
        plate: offer.applicantPlate ?? "",
        email: offer.applicantEmail,
        phone: offer.applicantPhone ?? "",
        price: String(price),
        offerId: offer.id,
      },
    });

    if (!checkout.url) {
      return htmlPage("<h2>決済ページの作成に失敗しました</h2><p>お問い合わせください。</p>");
    }

    await prisma.eventMonthlyOffer.update({
      where: { id: offer.id },
      data: { status: "RELEASED", applicantCheckoutSession: checkout.id },
    });

    try {
      await sendOfferApplicantPaymentMail({
        to: offer.applicantEmail,
        name: offer.applicantName ?? "",
        placeName: place.name,
        spotLabel: spot.label ?? spot.code,
        date,
        priceYen: price,
        checkoutUrl: checkout.url,
      });
    } catch (e) {
      console.error("applicant payment mail failed:", e);
    }

    await sendSlackNotification(
      `【承認待ち・お譲り】${contract.tenant.name} さんが ${date} / ${spot.label ?? spot.code} を希望者(${offer.applicantEmail})へお譲り。決済リンクを送付しました。`
    ).catch(() => {});

    return htmlPage(
      `<h2>受付しました</h2><p>${date} の区画を利用希望者へお譲りしました。希望者にお支払い案内を送信しました。</p>`
    );
  } catch (error) {
    console.error("[offer-decline] error:", error);
    return htmlPage("<h2>エラーが発生しました</h2><p>時間をおいて再度お試しください。</p>");
  }
}
