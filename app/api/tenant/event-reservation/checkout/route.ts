export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getTenantSession } from "@/lib/tenant-auth";
import { getReservationFixedPrice, ymdToUtcDate } from "@/lib/pricing-core";

function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json(
    { ok: false, error: error ?? "bad_request", message },
    { status }
  );
}

function normalizeDate(input: string) {
  const v = String(input ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return v;
}

export async function POST(req: NextRequest) {
  const session = await getTenantSession();
  if (!session) {
    return jsonError("ログインが必要です", 401, "unauthorized");
  }

  try {
    const body = await req.json().catch(() => ({}));
    const date = normalizeDate(body?.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError("date は YYYY-MM-DD 形式で指定してください", 400, "invalid_date");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      include: {
        contracts: { include: { place: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!tenant) return jsonError("契約者が見つかりません", 404, "tenant_not_found");

    const contract = tenant.contracts.find((c) => c.status === "ACTIVE") ?? null;
    if (!contract) return jsonError("有効な契約がありません", 403, "no_active_contract");
    if (!contract.spotId) {
      return jsonError("契約に駐車区画が割り当てられていません", 409, "no_spot");
    }
    const place = contract.place;
    if (!place) return jsonError("駐車場が見つかりません", 404, "place_not_found");

    // イベント日であることを確認
    const eventDay = await prisma.eventDay.findFirst({
      where: { placeId: place.id, date: ymdToUtcDate(date), isActive: true },
      select: { id: true },
    });
    if (!eventDay) {
      return jsonError("指定日はイベント開催日ではありません", 409, "not_event_day");
    }

    // 自分の月極区画
    const spot = await prisma.spot.findFirst({
      where: { id: contract.spotId, placeId: place.id, isActive: true },
      select: { id: true, code: true, label: true },
    });
    if (!spot) return jsonError("駐車区画が見つかりません", 404, "spot_not_found");

    // 既にその区画がCONFIRMED予約済みなら不可（解放後に一般が取った等）
    const existing = await prisma.reservation.findFirst({
      where: { spotId: spot.id, date, status: "CONFIRMED" },
      select: { id: true },
    });
    if (existing) {
      return jsonError("この区画は既に予約済みです", 409, "already_reserved");
    }

    // 料金は一般イベント予約と同額の固定料金
    const price = await getReservationFixedPrice(place.id, date);
    if (!Number.isFinite(price) || price <= 0) {
      return jsonError("料金の計算に失敗しました", 500, "invalid_price");
    }

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    ).trim();

    // 成立処理は既存の webhook(flow="reservation") を再利用（spotId=自分のA-xx）。
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: tenant.email,
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
      success_url: `${appUrl}/tenant/dashboard?reserved=1`,
      cancel_url: `${appUrl}/tenant/dashboard`,
      metadata: {
        flow: "reservation",
        placeId: place.id,
        spotId: spot.id,
        slot: spot.code,
        date,
        name: tenant.name,
        plate: contract.plate,
        email: tenant.email,
        phone: tenant.phone,
        price: String(price),
      },
    });

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (error) {
    console.error("[tenant/event-reservation/checkout] error:", error);
    return jsonError("予約の作成に失敗しました", 500, "server_error");
  }
}
