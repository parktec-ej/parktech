import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { getPartnerSession } from "@/lib/partner-auth";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json(
    {
      ok: false,
      error: error ?? "bad_request",
      message,
    },
    { status }
  );
}

function normalizeDate(input: string) {
  const value = String(input ?? "").trim();

  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  return value;
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanText(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

// 料金はサーバ側で再計算する（クライアントの値は信用しない）
function computeBusPrice(vehicleType: "bus" | "car", hasExtraCar: boolean): number {
  if (vehicleType === "car") return 4000;
  return hasExtraCar ? 14000 : 10000; // bus
}

async function resolvePartnerBusPlace() {
  const slug = String(process.env.PARTNER_BUS_PLACE_SLUG ?? "").trim();

  if (!slug) {
    throw new Error("PARTNER_BUS_PLACE_SLUG is not set");
  }

  return prisma.place.findFirst({
    where: {
      slug,
      isActive: true,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      address: true,
      operationMode: true,
    },
  });
}

export async function POST(req: Request) {
  const partnerSession = await getPartnerSession();
  if (!partnerSession) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return jsonError("invalid_json", 400, "invalid_json");
    }

    const date = normalizeDate(body.date);
    const busPartnerId = cleanText(body.busPartnerId, 64);
    const arrivalTime = cleanText(body.arrivalTime, 20);
    const note = cleanText(body.note, 500);
    const eventName = cleanText(body.eventName, 100);
    const vehicleType: "bus" | "car" = body.vehicleType === "car" ? "car" : "bus";
    // hasExtraCar は bus のときのみ有効
    const hasExtraCar = Boolean(body.hasExtraCar) && vehicleType === "bus";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(
        "date は YYYY-MM-DD 形式で指定してください。",
        400,
        "invalid_date"
      );
    }

    if (!busPartnerId) {
      return jsonError("業者を選択してください。", 400, "busPartnerId_required");
    }

    if (!eventName) {
      return jsonError("イベント名を入力してください。", 400, "eventName_required");
    }

    if (vehicleType !== "bus" && vehicleType !== "car") {
      return jsonError("車両タイプが不正です。", 400, "vehicleType_invalid");
    }

    const busPartner = await prisma.busPartner.findFirst({
      where: { id: busPartnerId, isActive: true },
      select: {
        id: true,
        name: true,
        contact: true,
        phone: true,
        email: true,
      },
    });

    if (!busPartner) {
      return jsonError("業者が見つかりません。", 404, "busPartner_not_found");
    }

    const companyName = busPartner.name;
    const contactName = busPartner.contact;
    const phone = busPartner.phone;
    const email = busPartner.email;

    if (!isEmailLike(email)) {
      return jsonError(
        "業者のメールアドレスが不正です。",
        400,
        "email_invalid"
      );
    }

    const place = await resolvePartnerBusPlace();
    if (!place) {
      return jsonError(
        "バス用 place が見つかりません。",
        404,
        "place_not_found"
      );
    }

    // ── スロット割当 ──────────────────────────────
    // ・bus 単体 / car 単体        → 区画外のバス専用レーン（spotId なし, slot="BUS_LANE"）
    // ・bus + 追加普通車(hasExtraCar) → バスは BUS_LANE、追加普通車が A-20 区画を占有
    let spotId: string | null = null;
    let slot = "BUS_LANE";

    if (hasExtraCar) {
      // A-20 はバスplace ではなく一般lot「rifu-main」の区画（クロスplace参照）。
      // 予約レコードの placeId はバスplaceのまま、spotId だけ rifu-main の A-20。
      const generalPlace = await prisma.place.findFirst({
        where: { slug: "rifu-main", isActive: true },
        select: { id: true },
      });

      if (!generalPlace) {
        return jsonError(
          "一般駐車場（rifu-main）が見つかりません。",
          500,
          "general_place_not_found"
        );
      }

      const a20 = await prisma.spot.findFirst({
        where: { placeId: generalPlace.id, code: "A-20", isActive: true },
        select: { id: true, code: true },
      });

      if (!a20) {
        return jsonError(
          "追加普通車用の A-20 区画が見つかりません。",
          500,
          "a20_not_found"
        );
      }

      // A-20 がその日すでに予約済み（CANCELED 以外）なら不可。
      // 占有判定は spotId 単独（一般予約=placeId rifu-main / バス追加車=placeId
      // rifu-main-bus の両方を取りこぼさないため、placeId は条件に入れない）。
      const a20Taken = await prisma.reservation.findFirst({
        where: {
          spotId: a20.id,
          date,
          status: { not: "CANCELED" },
        },
        select: { id: true },
      });

      if (a20Taken) {
        return NextResponse.json(
          {
            ok: false,
            error: "a20_already_reserved",
            message: "この日は追加普通車用の A-20 区画が既に埋まっています。",
          },
          { status: 409 }
        );
      }

      spotId = a20.id; // rifu-main の A-20 spot id
      slot = "A-20";
    }

    // 料金はサーバ側で再計算
    const price = computeBusPrice(vehicleType, hasExtraCar);

    if (!Number.isFinite(price) || price <= 0) {
      return jsonError(
        "予約金額の計算に失敗しました。",
        500,
        "invalid_price"
      );
    }

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000"
    ).trim();

    const vehicleLabel =
      vehicleType === "bus"
        ? hasExtraCar
          ? "バス＋普通車"
          : "バス"
        : "普通車";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email || undefined,
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: {
              name: `${place.name} バス予約 ${date} ${vehicleLabel}`,
            },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/partner/bus-reserve/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/partner/bus-reserve?date=${encodeURIComponent(date)}`,
      metadata: {
        flow: "bus_reservation",
        placeId: place.id,
        spotId: spotId ?? "",
        slot,
        date,
        name: contactName,
        email,
        price: String(price),

        companyName,
        contactName,
        phone,
        arrivalTime,
        note,

        eventName,
        vehicleType,
        hasExtraCar: hasExtraCar ? "true" : "false",
        busPartnerId,
      },
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
    });
  } catch (error: any) {
    console.error("[partner/bus-checkout] error:", error);

    return jsonError(
      String(error?.message ?? "checkout 作成に失敗しました"),
      500,
      "server_error"
    );
  }
}
