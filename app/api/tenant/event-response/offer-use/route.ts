export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { verifyEventToken } from "@/lib/event-token";
import { getReservationFixedPrice } from "@/lib/pricing-core";
import {
  sendReservationPinMail,
  sendOfferApplicantUnavailableMail,
  sendOfferTenantChargeFailedMail,
} from "@/lib/mail";
import { sendSlackNotification } from "@/lib/slack";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();

function genPin4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
function pmId(v: string | Stripe.PaymentMethod | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}
function htmlPage(inner: string) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:0 16px;line-height:1.8;color:#111">${inner}<p style="margin-top:16px"><a href="${APP_URL}/tenant/dashboard">契約者ページへ</a></p></div>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

// GET: 確認ページ（メールスキャナ誤クリックで課金しないよう確定はPOST）
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyEventToken(token);
  if (!payload || payload.a !== "offer_use") {
    return htmlPage("<h2>リンクが無効です</h2><p>お問い合わせください。</p>");
  }
  return htmlPage(`
    <h2>この日、ご自身で駐車しますか？</h2>
    <p>対象日: ${payload.d}</p>
    <p>「利用する」を確定すると、当日分の駐車料金がご登録のカードから自動的に請求され、当日の区画があなたのご予約として確保されます（取り消せません）。</p>
    <form method="POST" action="${APP_URL}/api/tenant/event-response/offer-use">
      <input type="hidden" name="token" value="${token}" />
      <button type="submit" style="background:#111;color:#fff;border:none;padding:12px 20px;border-radius:8px;font-weight:bold;cursor:pointer">利用する（カードで自動決済）</button>
    </form>
  `);
}

// POST: WAITINGを原子的に確保→オフセッション課金→成功:TENANT_TOOK / 失敗:手動リンク
export async function POST(req: NextRequest) {
  let token = "";
  try {
    const form = await req.formData();
    token = String(form.get("token") ?? "");
  } catch {
    token = "";
  }
  const payload = verifyEventToken(token);
  if (!payload || payload.a !== "offer_use") {
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
    const spotId = contract.spotId;

    const offer = await prisma.eventMonthlyOffer.findUnique({
      where: { spotId_date: { spotId, date } },
      select: { id: true, status: true, applicantName: true, applicantEmail: true },
    });
    if (!offer) {
      return htmlPage("<h2>対象の申請が見つかりません</h2><p>受付が取り消された可能性があります。</p>");
    }
    if (offer.status !== "WAITING") {
      return htmlPage("<h2>既に処理済みです</h2><p>この申請は既に処理されています。</p>");
    }

    const reserved = await prisma.reservation.findFirst({
      where: { spotId, date, status: "CONFIRMED" },
      select: { id: true },
    });
    if (reserved) {
      return htmlPage("<h2>受付できません</h2><p>この日は既に予約が入っています。</p>");
    }

    const spot = await prisma.spot.findFirst({
      where: { id: spotId, placeId: place.id, isActive: true },
      select: { id: true, code: true, label: true },
    });
    if (!spot) return htmlPage("<h2>区画が見つかりません</h2><p></p>");

    const price = await getReservationFixedPrice(place.id, date);
    if (!Number.isFinite(price) || price <= 0) {
      return htmlPage("<h2>料金の計算に失敗しました</h2><p>お問い合わせください。</p>");
    }

    // 二重課金防止：WAITING のときだけ原子的に TENANT_CHARGE_PENDING を確保
    const claim = await prisma.eventMonthlyOffer.updateMany({
      where: { id: offer.id, status: "WAITING" },
      data: { status: "TENANT_CHARGE_PENDING" },
    });
    if (claim.count !== 1) {
      return htmlPage("<h2>処理中です</h2><p>この申請は既に処理されています。</p>");
    }

    // ---- オフセッション課金（サブスクIDから customer/PM を引く） ----
    let chargedPi: Stripe.PaymentIntent | null = null;
    let customerId: string | null = null;
    let usablePm: string | null = null;
    let lastErr = "";
    const subId = contract.stripeSubscriptionId;

    if (subId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subId, {
          expand: ["default_payment_method"],
        });
        customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        usablePm = pmId(sub.default_payment_method);
        if (!usablePm && customerId) {
          const cust = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
          usablePm = pmId(cust.invoice_settings?.default_payment_method);
        }
      } catch (e) {
        lastErr = `retrieve: ${String(e)}`;
      }
    } else {
      lastErr = "no subscription";
    }

    if (customerId && usablePm) {
      for (let attempt = 0; attempt < 2 && !chargedPi; attempt++) {
        try {
          const pi = await stripe.paymentIntents.create({
            amount: price,
            currency: "jpy",
            customer: customerId,
            payment_method: usablePm,
            off_session: true,
            confirm: true,
            metadata: {
              flow: "offer_tenant_charge",
              offerId: offer.id,
              contractId: contract.id,
              spotId,
              date,
            },
          });
          if (pi.status === "succeeded") chargedPi = pi;
          else lastErr = `pi status: ${pi.status}`;
        } catch (e) {
          lastErr = `charge: ${String(e)}`;
        }
      }
    }

    // ---- 成功：予約作成＋TENANT_TOOK＋通知 ----
    if (chargedPi) {
      try {
        const reservation = await prisma.reservation.create({
          data: {
            placeId: place.id,
            spotId,
            date,
            slot: spot.code,
            name: contract.tenant.name,
            plate: contract.plate,
            email: contract.tenant.email,
            phone: contract.tenant.phone,
            price,
            pin: genPin4(),
            paid: true,
            paidAt: new Date(),
            paymentRef: chargedPi.id,
            status: "CONFIRMED",
            cancelToken: crypto.randomUUID(),
            refundStatus: "NONE",
            refundAmount: null,
          },
        });

        await prisma.eventMonthlyOffer.update({
          where: { id: offer.id },
          data: { status: "TENANT_TOOK", monthlyChargePaymentIntentId: chargedPi.id },
        });

        try {
          await sendReservationPinMail({
            to: contract.tenant.email,
            placeName: place.name,
            spotLabel: spot.label ?? spot.code,
            date,
            slot: spot.code,
            plate: contract.plate,
            phone: contract.tenant.phone,
            price,
            pin: reservation.pin,
            googleMapUrl: place.googleMapUrl ?? null,
            manageUrl: null,
          });
        } catch (e) {
          console.error("tenant reservation mail failed:", e);
        }

        if (offer.applicantEmail) {
          try {
            await sendOfferApplicantUnavailableMail({
              to: offer.applicantEmail,
              name: offer.applicantName ?? "",
              placeName: place.name,
              date,
            });
          } catch (e) {
            console.error("applicant unavailable mail failed:", e);
          }
        }

        await sendSlackNotification(
          `【承認待ち・月極が利用】${contract.tenant.name} さんが ${date} / ${spot.label ?? spot.code} を利用。¥${price} を自動決済しました。`
        ).catch(() => {});

        return htmlPage(
          `<h2>ご予約を確定しました</h2><p>${date} の区画をご予約として確保し、当日分の料金 ¥${price} を決済しました。ありがとうございます。</p>`
        );
      } catch (e) {
        // 課金成功後にDB処理が失敗＝要手動対応
        console.error("[offer-use] post-charge failure:", e);
        await sendSlackNotification(
          `🔴【要対応】課金成功後の予約作成に失敗。PI=${chargedPi.id} offer=${offer.id} contract=${contract.id}`
        ).catch(() => {});
        return htmlPage(
          "<h2>ご予約処理でエラーが発生しました</h2><p>お支払いは完了しています。担当者が確認しますので、しばらくお待ちください。</p>"
        );
      }
    }

    // ---- 失敗：TENANT_CHARGE_PENDING のまま手動決済リンクを送付 ----
    let checkoutUrl = "";
    try {
      const checkout = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        ...(customerId
          ? { customer: customerId }
          : { customer_email: contract.tenant.email }),
        line_items: [
          {
            price_data: {
              currency: "jpy",
              product_data: {
                name: `${place.name} ${spot.label ?? spot.code} イベント日利用`,
                description: `${date} / ${spot.label ?? spot.code}`,
              },
              unit_amount: price,
            },
            quantity: 1,
          },
        ],
        success_url: `${APP_URL}/tenant/dashboard?paid=1`,
        cancel_url: `${APP_URL}/tenant/dashboard`,
        metadata: {
          flow: "reservation",
          offerRole: "tenant",
          offerId: offer.id,
          placeId: place.id,
          spotId,
          slot: spot.code,
          date,
          name: contract.tenant.name,
          plate: contract.plate,
          email: contract.tenant.email,
          phone: contract.tenant.phone ?? "",
          price: String(price),
        },
      });
      checkoutUrl = checkout.url ?? "";
    } catch (e) {
      console.error("tenant fallback checkout failed:", e);
    }

    if (checkoutUrl) {
      try {
        await sendOfferTenantChargeFailedMail({
          to: contract.tenant.email,
          tenantName: contract.tenant.name,
          placeName: place.name,
          spotLabel: spot.label ?? spot.code,
          date,
          priceYen: price,
          checkoutUrl,
        });
      } catch (e) {
        console.error("tenant charge-failed mail failed:", e);
      }
    }

    await sendSlackNotification(
      `⚠️【承認待ち・自動決済失敗】${contract.tenant.name} さん ${date} / ${spot.label ?? spot.code}。理由:${lastErr}。${checkoutUrl ? "手動決済リンク送付" : "リンク作成も失敗（要対応）"}`
    ).catch(() => {});

    return htmlPage(
      checkoutUrl
        ? "<h2>自動決済に失敗しました</h2><p>ご登録カードでの自動決済ができませんでした。お支払いリンクをメールでお送りしましたので、開催日の3日前までにお手続きください。</p>"
        : "<h2>エラーが発生しました</h2><p>お手数ですが、お問い合わせください。</p>"
    );
  } catch (error) {
    console.error("[offer-use] error:", error);
    return htmlPage("<h2>エラーが発生しました</h2><p>時間をおいて再度お試しください。</p>");
  }
}
