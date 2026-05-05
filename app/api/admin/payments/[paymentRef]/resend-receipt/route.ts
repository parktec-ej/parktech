export const runtime = "nodejs";
export const preferredRegion = "hnd1";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { sendCheckoutThanksMail } from "@/lib/mail";

function formatJst(d: Date | null | undefined) {
  if (!d) return undefined;
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function formatYmdJst(d: Date | null | undefined) {
  if (!d) return undefined;
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ paymentRef: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { paymentRef } = await context.params;
    if (!paymentRef) {
      return NextResponse.json(
        { ok: false, error: "missing_paymentRef" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const overrideEmail = String(body?.email ?? "").trim();

    const payment = await prisma.payment.findFirst({
      where: { paymentRef },
      orderBy: { createdAt: "desc" },
      include: {
        Reservation: {
          select: {
            id: true,
            email: true,
            name: true,
            plate: true,
            date: true,
            slot: true,
            checkedInAt: true,
            checkedOutAt: true,
            price: true,
          },
        },
        ParkingSession: {
          select: {
            id: true,
            checkInAt: true,
            checkOutAt: true,
            totalMinutes: true,
            totalYen: true,
            customerName: true,
            plate: true,
            phone: true,
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { ok: false, error: "payment_not_found" },
        { status: 404 }
      );
    }

    const fallbackEmail = payment.Reservation?.email ?? null;
    const email = overrideEmail || fallbackEmail || "";

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_email",
          message: "有効なメールアドレスを入力してください",
        },
        { status: 400 }
      );
    }

    const isHourly = payment.kind === "HOURLY";
    const flowLabel: "予約利用" | "時間貸し" = isHourly ? "時間貸し" : "予約利用";

    const placeName = payment.placeNameSnapshot;
    const spotLabel =
      payment.spotLabelSnapshot ?? payment.spotCodeSnapshot ?? "";

    const useDate =
      payment.serviceDate ??
      payment.Reservation?.date ??
      formatYmdJst(payment.ParkingSession?.checkInAt) ??
      "";

    const checkInAt = isHourly
      ? payment.ParkingSession?.checkInAt
      : payment.Reservation?.checkedInAt;
    const checkOutAt = isHourly
      ? payment.ParkingSession?.checkOutAt
      : payment.Reservation?.checkedOutAt;

    const minutes = isHourly
      ? payment.ParkingSession?.totalMinutes ?? null
      : null;

    const totalYen = payment.grossAmount;

    await sendCheckoutThanksMail({
      to: email,
      placeName,
      spotLabel,
      useDate,
      checkIn: formatJst(checkInAt),
      checkOut: formatJst(checkOutAt),
      minutes,
      totalYen,
      paymentRef: paymentRef,
      flowLabel,
    });

    return NextResponse.json({
      ok: true,
      to: email,
      paymentRef,
    });
  } catch (error) {
    console.error("[admin/payments/resend-receipt] error:", error);
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
