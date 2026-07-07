export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { sendSlackNotification } from "@/lib/slack";
import {
  sendOfferApplicantPaymentMail,
  sendMonthlyOfferSelfUseNoticeMail,
} from "@/lib/mail";
import { getEventDayConfig, getReservationFixedPrice } from "@/lib/pricing-core";
import {
  MONTHLY_PLACE_SLUG,
  MONTHLY_SLOT_CODES,
  OCCUPYING_STATUSES,
  MONTHLY_EVENT_OFFER_DEADLINE_DAYS,
} from "@/lib/monthly-config";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();

function ymdTodayJst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}
function ymdPlusDaysJst(days: number): string {
  const today = ymdTodayJst();
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const summary = {
    released: 0,
    expired: 0,
    selfUseNotified: 0,
    errors: [] as string[],
  };

  try {
    const place = await prisma.place.findFirst({
      where: { slug: MONTHLY_PLACE_SLUG, isActive: true },
      select: { id: true, name: true },
    });
    if (!place) {
      return NextResponse.json({ ok: false, error: "place_not_found" }, { status: 404 });
    }

    const today = ymdTodayJst();
    const deadlineDay = ymdPlusDaysJst(MONTHLY_EVENT_OFFER_DEADLINE_DAYS);

    // ---- (1) 締切到達の未決着オファーを申請者へ自動リリース ----
    // WAITING（無回答）/ TENANT_CHARGE_PENDING（月極が使うと言ったが未決済）で、
    // イベント日が「締切(=3日前)到達済み」かつ「まだ過ぎていない」もの。
    const toRelease = await prisma.eventMonthlyOffer.findMany({
      where: {
        placeId: place.id,
        status: { in: ["WAITING", "TENANT_CHARGE_PENDING"] },
        date: { lte: deadlineDay, gte: today },
      },
    });

    for (const offer of toRelease) {
      try {
        if (!offer.applicantEmail) {
          await sendSlackNotification(
            `⚠️【承認待ち】自動リリース対象だが申請者メール無し offer=${offer.id}`
          ).catch(() => {});
          continue;
        }
        const spot = await prisma.spot.findFirst({
          where: { id: offer.spotId, placeId: place.id, isActive: true },
          select: { id: true, code: true, label: true },
        });
        if (!spot) continue;

        // 既に予約があればリリースしない
        const reserved = await prisma.reservation.findFirst({
          where: { spotId: offer.spotId, date: offer.date, status: "CONFIRMED" },
          select: { id: true },
        });
        if (reserved) continue;

        const price = await getReservationFixedPrice(place.id, offer.date);
        if (!Number.isFinite(price) || price <= 0) continue;

        // 先に Checkout を作成 → 原子的に RELEASED＋session を確保（無回答→申請者へ）
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
            spotId: offer.spotId,
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

        const claim = await prisma.eventMonthlyOffer.updateMany({
          where: { id: offer.id, status: { in: ["WAITING", "TENANT_CHARGE_PENDING"] } },
          data: { status: "RELEASED", applicantCheckoutSession: checkout.id },
        });
        if (claim.count !== 1) continue; // 既に処理済み（Checkoutは未使用のまま無害）

        if (checkout.url) {
          await sendOfferApplicantPaymentMail({
            to: offer.applicantEmail,
            name: offer.applicantName ?? "",
            placeName: place.name,
            spotLabel: spot.label ?? spot.code,
            date: offer.date,
            priceYen: price,
            checkoutUrl: checkout.url,
          });
        }
        summary.released++;
      } catch (e) {
        summary.errors.push(`release ${offer.id}: ${String(e)}`);
      }
    }

    // ---- (2) イベント日を過ぎた未決着オファーを EXPIRED ----
    const expired = await prisma.eventMonthlyOffer.updateMany({
      where: {
        placeId: place.id,
        status: { in: ["WAITING", "TENANT_CHARGE_PENDING", "RELEASED"] },
        date: { lt: today },
      },
      data: { status: "EXPIRED" },
    });
    summary.expired = expired.count;

    // ---- (3) 3日前：オファーも予約も無い月極区画へ「そのまま利用可」通知 ----
    const eventDay = await getEventDayConfig(place.id, deadlineDay);
    if (eventDay) {
      const spots = await prisma.spot.findMany({
        where: {
          placeId: place.id,
          code: { in: [...MONTHLY_SLOT_CODES] },
          isActive: true,
        },
        select: { id: true, code: true, label: true },
      });
      for (const spot of spots) {
        try {
          const contract = await prisma.monthlyContract.findFirst({
            where: { spotId: spot.id, status: { in: [...OCCUPYING_STATUSES] } },
            include: { tenant: true },
          });
          if (!contract?.tenant?.email) continue;

          // 「利用しない」と回答済みの契約者には「そのまま使えます」通知を送らない。
          const declined = await prisma.monthlyEventResponse.findUnique({
            where: {
              contractId_date: { contractId: contract.id, date: deadlineDay },
            },
            select: { status: true },
          });
          if (declined?.status === "DECLINED") continue;

          // 既に解放済み（旧仕様の残マーカー等）はスキップ
          const dayMode = await prisma.spotModeCalendar.findUnique({
            where: { spotId_date: { spotId: spot.id, date: deadlineDay } },
            select: { operationMode: true },
          });
          if (dayMode?.operationMode === "RESERVATION_ONLY") continue;

          // オファーがあればスキップ（承認待ち等の対象）
          const offer = await prisma.eventMonthlyOffer.findUnique({
            where: { spotId_date: { spotId: spot.id, date: deadlineDay } },
            select: { id: true },
          });
          if (offer) continue;

          // 予約があればスキップ（既に確保済み）
          const reserved = await prisma.reservation.findFirst({
            where: { spotId: spot.id, date: deadlineDay, status: "CONFIRMED" },
            select: { id: true },
          });
          if (reserved) continue;

          await sendMonthlyOfferSelfUseNoticeMail({
            to: contract.tenant.email,
            tenantName: contract.tenant.name,
            placeName: place.name,
            spotLabel: spot.label ?? spot.code,
            date: deadlineDay,
          });
          summary.selfUseNotified++;
        } catch (e) {
          summary.errors.push(`selfuse ${spot.id}: ${String(e)}`);
        }
      }
    }

    if (summary.released > 0 || summary.expired > 0 || summary.selfUseNotified > 0) {
      await sendSlackNotification(
        `【承認待ちバッチ】自動リリース:${summary.released} / 期限切れ:${summary.expired} / そのまま利用可:${summary.selfUseNotified}`
      ).catch(() => {});
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[monthly-offer-batch] error:", error);
    return NextResponse.json(
      { ok: false, error: "server_error", detail: String(error) },
      { status: 500 }
    );
  }
}
