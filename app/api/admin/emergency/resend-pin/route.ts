export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { sendReservationPinMail } from "@/lib/mail";
import { sendSlackNotification } from "@/lib/slack";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
        place: { select: { name: true, googleMapUrl: true } },
        spot: { select: { code: true, label: true } },
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { ok: false, error: "reservation_not_found" },
        { status: 404 }
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

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    ).trim();
    const manageUrl = reservation.cancelToken
      ? `${appUrl}/reservation/manage?token=${encodeURIComponent(reservation.cancelToken)}`
      : null;

    await sendReservationPinMail({
      to: email,
      placeName: reservation.place?.name ?? "",
      spotLabel:
        reservation.spot?.label ?? reservation.spot?.code ?? reservation.slot,
      date: reservation.date,
      slot: reservation.slot,
      plate: reservation.plate,
      phone: reservation.phone,
      price: reservation.price,
      pin: reservation.pin,
      googleMapUrl: reservation.place?.googleMapUrl ?? null,
      manageUrl,
    });

    await sendSlackNotification(
      [
        "🛟 [緊急対応] PIN再送",
        `operator: ${admin.email}`,
        `reservationId: ${reservation.id}`,
        `to: ${email}`,
        reason ? `理由: ${reason}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );

    return NextResponse.json({ ok: true, to: email });
  } catch (error) {
    console.error("[admin/emergency/resend-pin] error:", error);
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
