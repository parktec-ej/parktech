export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { sendSlackNotification } from "@/lib/slack";

function jsonError(error: string, status = 400, message?: string) {
  return NextResponse.json(
    {
      ok: false,
      error,
      ...(message ? { message } : {}),
    },
    { status }
  );
}

function normalizeYmd(input: string): string {
  const v = String(input ?? "").trim();
  if (!v) return "";
  // accept "YYYY-MM-DD" or full ISO datetime — take the date portion
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return "";
}

function genPin4() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("unauthorized", 401);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError("invalid_json", 400);
    }

    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const plate = String(body.vehicleNumber ?? body.plate ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const placeKey = String(body.place ?? body.placeId ?? body.placeSlug ?? "").trim();
    const slotInput = String(body.slot ?? "").trim();
    const startAt = String(body.startAt ?? "").trim();
    const endAt = String(body.endAt ?? "").trim();
    const paymentRef = String(body.paymentRef ?? "").trim();
    const note = String(body.note ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    const priceInput = Number(body.price);
    const price = Number.isFinite(priceInput) && priceInput >= 0 ? Math.trunc(priceInput) : 0;

    if (!name) return jsonError("name_required");
    if (!plate) return jsonError("plate_required");
    if (!placeKey) return jsonError("place_required");
    if (!slotInput) return jsonError("slot_required");
    if (!startAt) return jsonError("start_at_required");

    if (phone && !/^[0-9\-\s\+\(\)]+$/.test(phone)) {
      return jsonError("invalid_phone", 400, "電話番号の形式が正しくありません");
    }

    const date = normalizeYmd(startAt);
    if (!date) {
      return jsonError("invalid_start_at", 400, "startAt は YYYY-MM-DD 形式で指定してください");
    }

    const place = await prisma.place.findFirst({
      where: {
        OR: [{ id: placeKey }, { slug: placeKey }],
        isActive: true,
      },
      select: { id: true, slug: true, name: true },
    });
    if (!place) return jsonError("place_not_found", 404);

    const spot = await prisma.spot.findFirst({
      where: {
        placeId: place.id,
        code: slotInput,
        isActive: true,
      },
      select: { id: true, code: true, label: true },
    });
    if (!spot) return jsonError("spot_not_found", 404);

    // Detect conflict with any active confirmed reservation on the same place/spot/date
    const conflict = await prisma.reservation.findFirst({
      where: {
        placeId: place.id,
        spotId: spot.id,
        date,
        status: "CONFIRMED",
      },
      select: { id: true },
    });
    if (conflict) {
      return jsonError("already_reserved", 409, "同じ枠の予約が既に存在します");
    }

    const reservation = await prisma.reservation.create({
      data: {
        placeId: place.id,
        spotId: spot.id,
        date,
        slot: spot.code,
        name,
        plate,
        email: email || null,
        phone: phone || null,
        price,
        pin: genPin4(),
        paid: !!paymentRef,
        paidAt: paymentRef ? new Date() : null,
        paymentRef: paymentRef || null,
        status: "CONFIRMED",
        cancelToken: crypto.randomUUID(),
        refundStatus: "NONE",
      },
      select: {
        id: true,
        date: true,
        slot: true,
        name: true,
        plate: true,
        email: true,
        phone: true,
        price: true,
        pin: true,
        paid: true,
        paymentRef: true,
      },
    });

    await sendSlackNotification(
      [
        "🛟 [緊急対応] 手動予約作成",
        `operator: ${admin.email}`,
        `reservationId: ${reservation.id}`,
        `place/slot: ${place.slug}/${spot.code} (${date})`,
        `name: ${name}, plate: ${plate}, email: ${email || "-"}`,
        endAt ? `endAt: ${endAt}` : null,
        paymentRef ? `paymentRef: ${paymentRef}` : null,
        note ? `note: ${note}` : null,
        reason ? `理由: ${reason}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );

    return NextResponse.json({ ok: true, reservation });
  } catch (error) {
    console.error("[admin/emergency/create-reservation] error:", error);
    return jsonError(
      "server_error",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}
