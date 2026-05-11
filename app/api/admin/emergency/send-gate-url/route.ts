export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { sendGateUrlMail } from "@/lib/mail";
import { sendSlackNotification } from "@/lib/slack";

const GATE_BASE_URL = "https://gate.parktec-ej.com";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildGateUrl(placeSlug: string, slot: string) {
  return `${GATE_BASE_URL}/?place=${encodeURIComponent(placeSlug)}&slot=${encodeURIComponent(slot)}`;
}

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const reservationId = String(body?.reservationId ?? "").trim();
    const overrideEmail = String(body?.email ?? "").trim();
    const reason = String(body?.reason ?? "").trim();

    if (!reservationId) {
      return NextResponse.json(
        { ok: false, error: "reservation_id_required" },
        { status: 400 }
      );
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        place: { select: { slug: true, name: true } },
        spot: { select: { code: true, label: true } },
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { ok: false, error: "reservation_not_found" },
        { status: 404 }
      );
    }
    if (!reservation.place?.slug) {
      return NextResponse.json(
        { ok: false, error: "place_slug_missing" },
        { status: 400 }
      );
    }

    const email = overrideEmail || reservation.email || "";
    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_email",
          message: "有効なメールアドレスが必要です",
        },
        { status: 400 }
      );
    }

    const slot = reservation.spot?.code ?? reservation.slot;
    const gateUrl = buildGateUrl(reservation.place.slug, slot);

    await sendGateUrlMail({
      to: email,
      placeName: reservation.place.name,
      slot: reservation.spot?.label ?? slot,
      gateUrl,
      name: reservation.name,
    });

    await sendSlackNotification(
      [
        "🛟 [緊急対応] GATE URL送信",
        `operator: ${admin.email}`,
        `reservationId: ${reservation.id}`,
        `to: ${email}`,
        `url: ${gateUrl}`,
        reason ? `理由: ${reason}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );

    return NextResponse.json({ ok: true, to: email, gateUrl });
  } catch (error) {
    console.error("[admin/emergency/send-gate-url] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
