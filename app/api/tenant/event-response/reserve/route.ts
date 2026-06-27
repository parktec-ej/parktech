export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { verifyEventToken } from "@/lib/event-token";
import { getReservationFixedPrice, ymdToUtcDate } from "@/lib/pricing-core";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
).trim();

function htmlMessage(title: string, body: string) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:0 16px;line-height:1.8;color:#111"><h2>${title}</h2><p>${body}</p><p><a href="${APP_URL}/tenant/dashboard">契約者ページへ</a></p></div>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyEventToken(token);
  if (!payload || payload.a !== "reserve") {
    return htmlMessage("リンクが無効です", "契約者ページからお手続きください。");
  }

  try {
    const contract = await prisma.monthlyContract.findUnique({
      where: { id: payload.c },
      include: { tenant: true, place: true },
    });
    if (
      !contract ||
      contract.status !== "ACTIVE" ||
      contract.plan !== "INCLUDES_EVENT" ||
      !contract.spotId ||
      !contract.place
    ) {
      return htmlMessage("ご予約いただけません", "有効なプラン2契約が見つかりませんでした。");
    }
    const place = contract.place;
    const date = payload.d;

    const eventDay = await prisma.eventDay.findFirst({
      where: { placeId: place.id, date: ymdToUtcDate(date), isActive: true },
      select: { id: true },
    });
    if (!eventDay) {
      return htmlMessage("対象日がイベント日ではありません", "日付をご確認ください。");
    }

    const spot = await prisma.spot.findFirst({
      where: { id: contract.spotId, placeId: place.id, isActive: true },
      select: { id: true, code: true, label: true },
    });
    if (!spot) return htmlMessage("区画が見つかりません", "");

    const existing = await prisma.reservation.findFirst({
      where: { spotId: spot.id, date, status: "CONFIRMED" },
      select: { id: true },
    });
    if (existing) {
      return htmlMessage("既に予約済みです", "この区画は既にご予約済みです。");
    }

    const price = await getReservationFixedPrice(place.id, date);
    if (!Number.isFinite(price) || price <= 0) {
      return htmlMessage("料金の計算に失敗しました", "時間をおいて再度お試しください。");
    }

    const meRow = await prisma.monthlyEventResponse.upsert({
      where: { contractId_date: { contractId: contract.id, date } },
      update: {},
      create: {
        contractId: contract.id,
        placeId: place.id,
        spotId: spot.id,
        date,
        status: "NOTIFIED",
      },
      select: { id: true },
    });

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: contract.tenant.email,
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: {
              name: `${place.name} ${spot.label ?? spot.code} イベント日予約`,
              description: `${date} / ${spot.label ?? spot.code}（月極契約者）`,
            },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      success_url: `${APP_URL}/tenant/dashboard?reserved=1`,
      cancel_url: `${APP_URL}/tenant/dashboard`,
      metadata: {
        flow: "reservation",
        placeId: place.id,
        spotId: spot.id,
        slot: spot.code,
        date,
        name: contract.tenant.name,
        plate: contract.plate,
        email: contract.tenant.email,
        phone: contract.tenant.phone ?? "",
        price: String(price),
        meResponseId: meRow.id,
      },
    });

    if (!checkout.url) return htmlMessage("決済ページの作成に失敗しました", "");
    return NextResponse.redirect(checkout.url, { status: 303 });
  } catch (error) {
    console.error("[tenant/event-response/reserve] error:", error);
    return htmlMessage("エラーが発生しました", "時間をおいて再度お試しください。");
  }
}
